#!/bin/bash
set -euo pipefail

if [ "$CONTAINER_RUNTIME" = containerd ]; then
    ctr -n=k8s.io -a=/var/run/runtime.sock i pull "${IMAGE_TO_PULL}" --skip-verify
elif [ "$CONTAINER_RUNTIME" = docker ]; then
    set +e
    docker -H unix:///var/run/runtime.sock pull "${IMAGE_TO_PULL}" --disable-content-trust

    if [ $? -ne 0 ]; then
        set -e
        echo "Docker pull failed, pulling with buildah."
        buildah pull --tls-verify=false "${IMAGE_TO_PULL}"
        echo "Pushing from buildah to docker-daemon."
        # Expected by builda when docker-daemon is specified.
        ln -s /var/run/runtime.sock /var/run/docker.sock
        buildah push --disable-compression "${IMAGE_TO_PULL}" "docker-daemon:${IMAGE_TO_PULL}"
    fi

else
    echo "Container runtime is not supported"
    exit 1
fi
