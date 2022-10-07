window.document.addEventListener("DOMContentLoaded", function () {
  const CONTAINER_CLASS = ".installer-container";

  let installerData = {
    Linux: {
      minikube: {
        instructions: `
<p>We provide an automated convenience script for a complete <a
href="https://minikube.sigs.k8s.io/docs/start/">minikube</a> deployment. Taking care of installing
minikube, installing the <code class="docutils literal notranslate"><span
class="pre">orchest-cli</span></code> and installing Orchest, run it with:</p>
<div class="highlight">
<pre>
curl -fsSL https://get.orchest.io > convenience_install.sh \\
    && bash convenience_install.sh
</pre>
</div>
<p>In case any of these technologies is already installed on your machine, then the convenience script
will simply proceed to the next step.</p>

<p>Now that Orchest is installed, it can be reached on the IP returned by:</p>
<div class="highlight">
  <pre>minikube ip</pre>
</div>
        `,
      },
      MicroK8s: {
        instructions: `
<p>First, ensure you have <a href="https://microk8s.io/#install-microk8s">MicroK8s</a> installed.
Next, <a href="https://microk8s.io/docs/working-with-kubectl">configure kubectl</a> to access the cluster
and install the following addons:</p>
<div class="highlight">
<pre>
microk8s enable hostpath-storage \\
    && microk8s enable dns \\
    && microk8s enable ingress
</pre>
</div>
<p>These make sure your MicroK8s cluster is properly configured for you to use Orchest.</p>

<p>Next up, Orchest can be installed using the <code class="docutils literal notranslate"><span
class="pre">orchest-cli</span></code>:</p>
<div class="highlight">
<pre>
pip install --upgrade orchest-cli
orchest install --socket-path=/var/snap/microk8s/common/run/containerd.sock
</pre>
</div>
<p>Passing the <code class="docutils literal notranslate"><span
class="pre">--socket-path</span></code> flag is required for MicroK8s deployments for Orchest
to know the location of the container runtime socket. Without it Orchest won't be able to pull
your custom Environments to the MicroK8s node.

<p>Now that Orchest is installed, it can be reached on <a href="http://localhost/">localhost</a>
directly.</p>
          `,
      },
      K3s: {
        instructions: `
<p>First, install <a href="https://k3s.io/">K3s</a> without deploying <a href="https://traefik.io/">traefik</a> 
by running the following command:</p>
<div class="highlight">
<pre>
curl -sfL https://get.k3s.io | \\
    INSTALL_K3S_EXEC="--no-deploy traefik" sh -s -
</pre>
</div>
<p>Now Orchest can be installed using the <code class="docutils literal notranslate"><span
class="pre">orchest-cli</span></code>:</p>
<div class="highlight">
<pre>
pip install --upgrade orchest-cli
# Omit the socket path if you pointed k3s to use the system containerd.
orchest install --socket-path=/run/k3s/containerd/containerd.sock
</pre>
</div>
<p>Now that Orchest is installed, it can be reached on the IP address returned by:</p>
<div class="highlight">
  <pre>kubectl get service orchest-ingress-nginx-controller -n orchest \\
      -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'</pre>
</div>`,
      },
      "Docker Desktop": {
        instructions: `
<p>Follow the instructions to <a href="https://docs.docker.com/desktop/install/linux-install/"> install
Docker Desktop </a> on linux.</p>
<p>Once installed, go to its settings (top right) and if you wish to do so, change the
allocated resources. At least 2 cpus, 8GB of memory and 15GB of disk are required.</p>
<p><a href="https://docs.docker.com/desktop/kubernetes/"> Enable kubernetes in Docker Desktop</a></p>
<p>Now Orchest can be installed using the <code class="docutils literal notranslate"><span
class="pre">orchest-cli</span></code>:</p>
<div class="highlight">
<pre>
pip install --upgrade orchest-cli
orchest install
</pre>
</div>
<p>Now that Orchest is installed, it can be reached on <a href="http://localhost:80">localhost</a>.</p>`,
      },
    },
    macOS: {
      minikube: {
        instructions: `
<p>We provide an automated convenience script for a complete <a
href="https://minikube.sigs.k8s.io/docs/start/">minikube</a> deployment. Taking care of installing
minikube, installing the <code class="docutils literal notranslate"><span
class="pre">orchest-cli</span></code> and installing Orchest, run it with:</p>
<div class="highlight">
<pre>
curl -fsSL https://get.orchest.io > convenience_install.sh \\
    && bash convenience_install.sh
</pre>
</div>
<p>In case any of these technologies is already installed on your machine, then the convenience script
will simply proceed to the next step.</p>

<p>Now that Orchest is installed, it can be reached on <a href="http://localhost/">localhost</a> by
running the <code class="docutils literal notranslate"><span class="pre">minikube
tunnel</span></code> daemon.
          `,
      },
      "Docker Desktop": {
        instructions: `
<p>Follow the instructions to <a href="https://docs.docker.com/desktop/install/mac-install/"> install
Docker Desktop </a> on macOS.</p>
<p>Once installed, go to its settings (top right) and if you wish to do so, change the
allocated resources. At least 2 cpus, 8GB of memory and 15GB of disk are required.</p>
<p><a href="https://docs.docker.com/desktop/kubernetes/"> Enable kubernetes in Docker Desktop</a></p>
<p>Now Orchest can be installed using the <code class="docutils literal notranslate"><span
class="pre">orchest-cli</span></code>:</p>
<div class="highlight">
<pre>
pip install --upgrade orchest-cli
orchest install
</pre>
</div>
<p>Now that Orchest is installed, it can be reached on <a href="http://localhost:80">localhost</a>.</p>`,
      },
    },
    Windows: {
      minikube: {
        instructions: `
<p>For Orchest to work on Windows, Docker has to be configured to use WSL 2 (<a class="reference
external" href="https://docs.docker.com/desktop/windows/wsl/">Docker Desktop WSL 2 backend</a>).
For all further steps make sure to run CLI commands inside a WSL terminal. You can do this by
opening the distribution using the Start menu or by <a class="reference external"
href="https://docs.microsoft.com/en-us/windows/wsl/setup/environment#set-up-windows-terminal">setting
up the Windows Terminal</a>.</p>

<p>We provide an automated convenience script for a complete <a
href="https://minikube.sigs.k8s.io/docs/start/">minikube</a> deployment. Taking care of installing
minikube, installing the <code class="docutils literal notranslate"><span
class="pre">orchest-cli</span></code> and installing Orchest, run it with:</p>
<div class="highlight">
<pre>
curl -fsSL https://get.orchest.io > convenience_install.sh \\
    && bash convenience_install.sh
</pre>
</div>
<p>In case any of these technologies is already installed on your machine, then the convenience script
will simply proceed to the next step.</p>

<p>Now that Orchest is installed, it can be reached on the IP returned by:</p>
<div class="highlight">
  <pre>minikube ip</pre>
</div>
        `,
      },
      MicroK8s: {
        instructions: `
<p>For Orchest to work on Windows, Docker has to be configured to use WSL 2 (<a class="reference
external" href="https://docs.docker.com/desktop/windows/wsl/">Docker Desktop WSL 2 backend</a>).
For all further steps make sure to run CLI commands inside a WSL terminal. You can do this by
opening the distribution using the Start menu or by <a class="reference external"
href="https://docs.microsoft.com/en-us/windows/wsl/setup/environment#set-up-windows-terminal">setting
up the Windows Terminal</a>.</p>

<p>First, ensure you have <a href="https://microk8s.io/#install-microk8s">MicroK8s</a> installed.
Next, <a href="https://microk8s.io/docs/working-with-kubectl">configure kubectl</a> to access the cluster
and install the following addons:</p>
<div class="highlight">
<pre>
microk8s enable hostpath-storage \\
    && microk8s enable dns \\
    && microk8s enable ingress
</pre>
</div>
<p>These make sure your MicroK8s cluster is properly configured for you to use Orchest.</p>

<p>Next up, Orchest can be installed using the <code class="docutils literal notranslate"><span
class="pre">orchest-cli</span></code>:</p>
<div class="highlight">
<pre>
pip install --upgrade orchest-cli
orchest install --socket-path=/var/snap/microk8s/common/run/containerd.sock
</pre>
</div>
<p>Passing the <code class="docutils literal notranslate"><span
class="pre">--socket-path</span></code> flag is required for MicroK8s deployments for Orchest
to know the location of the container runtime socket. Without it Orchest won't be able to pull
your custom Environments to the MicroK8s node.

<p>Now that Orchest is installed, it can be reached on <a href="http://localhost/">localhost</a>
directly.</p>
          `,
      },
      K3s: {
        instructions: `
<p>For Orchest to work on Windows, Docker has to be configured to use WSL 2 (<a class="reference
external" href="https://docs.docker.com/desktop/windows/wsl/">Docker Desktop WSL 2 backend</a>).
For all further steps make sure to run CLI commands inside a WSL terminal. You can do this by
opening the distribution using the Start menu or by <a class="reference external"
href="https://docs.microsoft.com/en-us/windows/wsl/setup/environment#set-up-windows-terminal">setting
up the Windows Terminal</a>.</p>        

<p>First, install <a href="https://k3s.io/">K3s</a> without deploying <a href="https://traefik.io/">traefik</a> 
by running the following command:</p>
<div class="highlight">
<pre>
curl -sfL https://get.k3s.io | \\
    INSTALL_K3S_EXEC="--no-deploy traefik" sh -s -
</pre>
</div>
<p>Now Orchest can be installed using the <code class="docutils literal notranslate"><span
class="pre">orchest-cli</span></code>:</p>
<div class="highlight">
<pre>
pip install --upgrade orchest-cli
orchest install
</pre>
</div>
<p>Now that Orchest is installed, it can be reached on the IP address returned by:</p>
<div class="highlight">
  <pre>kubectl get service orchest-ingress-nginx-controller -n orchest \\
      -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'</pre>
</div>`,
      },
      "Docker Desktop": {
        instructions: `
<p>For Orchest to work on Windows, Docker Desktop has to be configured to use WSL 2 (<a class="reference
external" href="https://docs.docker.com/desktop/windows/wsl/">Docker Desktop WSL 2 backend</a>).
For all further steps make sure to run CLI commands inside a WSL terminal. You can do this by
opening the distribution using the Start menu or by <a class="reference external"
href="https://docs.microsoft.com/en-us/windows/wsl/setup/environment#set-up-windows-terminal">setting
up the Windows Terminal</a>.</p>        
<p>Once installed, go to its settings (top right) and if you wish to do so, change the
allocated resources. At least 2 cpus, 8GB of memory and 15GB of disk are required.</p>
<p><a href="https://docs.docker.com/desktop/kubernetes/"> Enable kubernetes in Docker Desktop</a></p>
<p>Now Orchest can be installed using the <code class="docutils literal notranslate"><span
class="pre">orchest-cli</span></code>:</p>
<div class="highlight">
<pre>
pip install --upgrade orchest-cli
orchest install
</pre>
</div>
<p>Now that Orchest is installed, it can be reached on <a href="http://localhost:80">localhost</a>.</p>`,
      },
    },
    Cloud: {
      GKE: {
        instructions: `
<p>Make sure to first create a
<a href="https://cloud.google.com/kubernetes-engine/docs/deploy-app-cluster#create_cluster">GKE cluster</a>
and
<a href="https://cloud.google.com/kubernetes-engine/docs/how-to/cluster-access-for-kubectl">configure kubectl</a>
to access the cluster.
</p>

<p>Now that your GKE cluster is set up correctly, Orchest can be installed using the <code
class="docutils literal notranslate"><span class="pre">orchest-cli</span></code>:</p>
<div class="highlight">
<pre>
pip install --upgrade orchest-cli
orchest install
</pre>
</div>

<p>After installing Orchest, you can reach it on the IP returned by:</p>
<div class="highlight">
<pre>kubectl get service orchest-ingress-nginx-controller -n orchest \\
      -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
</pre>
</div>
<p>
`,
      },
      EKS: {
        instructions: `
<p>
Get started by installing <a href="https://kubernetes.io/docs/tasks/tools/">kubectl</a> and setting up an
<a href="https://docs.aws.amazon.com/eks/latest/userguide/getting-started-eksctl.html">EKS cluster</a>
on AWS.
</p>

<p>All that is left is installing Orchest using the <code class="docutils literal notranslate"><span
class="pre">orchest-cli</span></code>:</p>
<div class="highlight">
<pre>
pip install --upgrade orchest-cli
orchest install
</pre>
</div>

<p>Now that Orchest is installed, it can be reached on the address returned by:</p>
<div class="highlight">
<pre>kubectl get service orchest-ingress-nginx-controller -n orchest \\
      -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
</pre>
</div>
<p>
        `,
      },
    },
  };

  let installerContainer = document.querySelector(CONTAINER_CLASS);
  if (!installerContainer) {
    // Element not found, skip init.
    return;
  }
  let OSs = Object.keys(installerData);

  let osHtml = OSs.map(
    (os) => `<button
    class="os"
  onclick="installer_widget.filter('${os}', '${
      Object.keys(installerData[os])[0]
    }')"
   data-os="${os}">${os}</button>`
  ).join(``);

  let platformHtml = OSs.map((os) =>
    Object.keys(installerData[os])
      .map(
        (distro) =>
          `<button class="distribution" data-os="${os}" data-distro="${distro}" onclick="installer_widget.filter('${os}', '${distro}')">${distro}</button>`
      )
      .join(``)
  ).join(``);

  let instructionsHtml = OSs.map((os) =>
    Object.keys(installerData[os])
      .map(
        (distro) =>
          `<div class="command" data-os="${os}" data-distro="${distro}">${installerData[os][distro].instructions}</div>`
      )
      .join(``)
  ).join(``);

  installerContainer.innerHTML = `
    <div>
      <div class="section">
        <div class="lhs-label">Deployment environment</div>
        <div class="content">${osHtml}</div>
      </div>
      <div class="section">
        <div class="lhs-label">Kubernetes distribution</div>
        <div class="content">${platformHtml}</div>
      </div>
      <div class="section">
        <div class="lhs-label"><strong>Installation</strong></div>
        <div class="content">${instructionsHtml}</div>
      </div>
    </div>
  `;

  function filter(os, distro) {
    let installerContainer = document.querySelector(CONTAINER_CLASS);
    let allButtons = document.querySelectorAll("button");

    allButtons.forEach((e) => e.classList.remove("active"));

    let distroAndinstructions = installerContainer.querySelectorAll(
      "button.distribution, div.command"
    );

    distroAndinstructions.forEach((e) => {
      e.style.display = "none";
    });

    let filtered = installerContainer.querySelectorAll(
      `button.distribution[data-os="${os}"], div.command[data-os="${os}"][data-distro="${distro}"]`
    );

    filtered.forEach((e) => {
      e.style.removeProperty("display");
    });

    let selected = installerContainer.querySelectorAll(
      `button.os[data-os="${os}"], button.distribution[data-os="${os}"][data-distro="${distro}"]`
    );

    selected.forEach((e) => {
      e.classList.add("active");
    });
  }

  // Apply filter initially
  filter(OSs[0], Object.keys(installerData[OSs[0]])[0]);

  // Binding to make onclick attributes work
  window.installer_widget = {
    filter,
  };
});
