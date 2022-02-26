from kubernetes import client as k8s_client
from kubernetes import config

config.load_incluster_config()
k8s_core_api = k8s_client.CoreV1Api()
k8s_apps_api = k8s_client.AppsV1Api()
k8s_custom_obj_api = k8s_client.CustomObjectsApi()
k8s_rbac_api = k8s_client.RbacAuthorizationV1Api()
