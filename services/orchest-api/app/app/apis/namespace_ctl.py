"""API endpoints for unspecified orchest-api level information."""
import uuid

import yaml
from flask import current_app, request
from flask_restx import Namespace, Resource
from orchestcli import cmds

from _orchest.internals import config as _config
from app import schema, utils
from config import CONFIG_CLASS

ns = Namespace("ctl", description="Orchest-api internal control.")
api = utils.register_schema(ns)


@api.route("/start-update")
class StartUpdate(Resource):
    @api.doc("orchest_api_start_update")
    @api.marshal_with(
        schema.update_sidecar_info,
        code=201,
        description="Update Orchest.",
    )
    def post(self):
        try:
            cmds.update(
                version=None,
                controller_deploy_name="orchest-controller",
                controller_pod_label_selector="app=orchest-controller",
                watch_flag=False,
                namespace="orchest",
                cluster_name="cluster-1",
            )
            return {}, 201
        except SystemExit:
            return {"message": "failed to update"}, 500


@api.route("/restart")
class Restart(Resource):
    @api.doc("orchest_api_restart")
    @ns.response(code=500, model=schema.dictionary, description="Invalid request")
    def post(self):
        try:
            cmds.restart(False, namespace="orchest", cluster_name="cluster-1")
            return {}, 201
        except SystemExit:
            return {"message": "failed to restart"}, 500


@api.route("/orchest-images-to-pre-pull")
class OrchestImagesToPrePull(Resource):
    @api.doc("orchest_images_to_pre_pull")
    def get(self):
        """Orchest images to pre pull on all nodes for a better UX."""
        pre_pull_orchest_images = [
            f"orchest/jupyter-enterprise-gateway:{CONFIG_CLASS.ORCHEST_VERSION}",
            f"orchest/session-sidecar:{CONFIG_CLASS.ORCHEST_VERSION}",
            CONFIG_CLASS.IMAGE_BUILDER_IMAGE,
            utils.get_jupyter_server_image_to_use(),
        ]
        pre_pull_orchest_images = {"pre_pull_images": pre_pull_orchest_images}

        return pre_pull_orchest_images, 200


@api.route("/orchest-settings")
class OrchestSettings(Resource):
    @api.doc("get_orchest_settings")
    def get(self):
        """Get Orchest settings as a json."""
        return utils.OrchestSettings().as_dict(), 200

    @api.doc("update_orchest_settings")
    @api.expect(schema.dictionary)
    @ns.response(code=200, model=schema.settings_update_response, description="Success")
    @ns.response(code=400, model=schema.dictionary, description="Invalid request")
    def put(self):
        """Update Orchest settings through a json.

        Works, essentially, as a dictionary update, it's an upsert.

        Returns the updated configuration. A 400 response with an error
        message is returned if any value is of the wrong type or
        invalid.
        """
        config = utils.OrchestSettings()
        try:
            config.update(request.get_json())
        except (TypeError, ValueError) as e:
            current_app.logger.debug(e, exc_info=True)
            return {"message": f"{e}"}, 400

        requires_restart = config.save(current_app)
        resp = {"requires_restart": requires_restart, "user_config": config.as_dict()}
        return resp, 200

    @api.doc("set_orchest_settings")
    @api.expect(schema.dictionary)
    @ns.response(code=200, model=schema.settings_update_response, description="Success")
    @ns.response(code=400, model=schema.dictionary, description="Invalid request")
    def post(self):
        """Replace Orchest settings through a json.

        Won't allow to remove values which have a defined default value
        and/or that shouldn't be removed.

        Returns the new configuration. A 400 response with an error
        message is returned if any value is of the wrong type or
        invalid.
        """
        config = utils.OrchestSettings()
        try:
            config.set(request.get_json())
        except (TypeError, ValueError) as e:
            current_app.logger.debug(e, exc_info=True)
            return {"message": f"{e}"}, 400

        requires_restart = config.save(current_app)
        resp = {"requires_restart": requires_restart, "user_config": config.as_dict()}
        return resp, 200


def _get_update_sidecar_manifest(update_pod_name, token: str) -> dict:
    manifest = {
        "apiVersion": "v1",
        "kind": "Pod",
        "metadata": {
            "generateName": "update-sidecar-",
            "labels": {
                "app": "update-sidecar",
                "app.kubernetes.io/name": "update-sidecar",
                "app.kubernetes.io/part-of": "orchest",
                "app.kubernetes.io/release": "orchest",
            },
        },
        "spec": {
            "containers": [
                {
                    "env": [
                        {"name": "PYTHONUNBUFFERED", "value": "TRUE"},
                        {
                            "name": "POD_NAME",
                            "valueFrom": {"fieldRef": {"fieldPath": "metadata.name"}},
                        },
                        {"name": "UPDATE_POD_NAME", "value": update_pod_name},
                        {"name": "TOKEN", "value": token},
                    ],
                    "image": f"orchest/update-sidecar:{CONFIG_CLASS.ORCHEST_VERSION}",
                    "imagePullPolicy": "IfNotPresent",
                    "name": "update-sidecar",
                }
            ],
            "restartPolicy": "Never",
            "terminationGracePeriodSeconds": 1,
            "serviceAccount": "orchest-api",
            "serviceAccountName": "orchest-api",
        },
    }
    return manifest


def _get_orchest_ctl_pod_manifest(command_label: str) -> dict:
    with open(_config.ORCHEST_CTL_POD_YAML_PATH, "r") as f:
        manifest = yaml.safe_load(f)

    manifest["metadata"]["labels"]["version"] = CONFIG_CLASS.ORCHEST_VERSION
    manifest["metadata"]["labels"]["command"] = command_label

    containers = manifest["spec"]["containers"]
    orchest_ctl_container = containers[0]
    orchest_ctl_container[
        "image"
    ] = f"orchest/orchest-ctl:{CONFIG_CLASS.ORCHEST_VERSION}"
    for env_var in orchest_ctl_container["env"]:
        if env_var["name"] == "ORCHEST_VERSION":
            env_var["value"] = CONFIG_CLASS.ORCHEST_VERSION
            break

    # This is to know the name in advance.
    manifest["metadata"].pop("generateName", None)
    manifest["metadata"]["name"] = f"orchest-ctl-{uuid.uuid4()}"
    return manifest


def _get_update_pod_manifest() -> dict:
    # The update pod is of the same version of the cluster, it will stop
    # the cluster then spawn an hidden-update pod which will update to
    # the desired version.
    manifest = _get_orchest_ctl_pod_manifest("update")

    containers = manifest["spec"]["containers"]
    orchest_ctl_container = containers[0]

    orchest_ctl_container["command"] = ["/bin/bash", "-c"]
    # Make sure the sidecar is online before updating.
    orchest_ctl_container["args"] = [
        "while true; do nc -zvw1 update-sidecar 80 > /dev/null 2>&1 && orchest update "
        "&& break; sleep 1; done"
    ]

    return manifest


def _get_restart_pod_manifest() -> dict:
    manifest = _get_orchest_ctl_pod_manifest("restart")

    containers = manifest["spec"]["containers"]
    orchest_ctl_container = containers[0]
    orchest_ctl_container["command"] = ["/bin/bash", "-c"]
    # Make sure the sidecar is online before updating.
    orchest_ctl_container["args"] = ["orchest restart"]

    return manifest
