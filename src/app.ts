import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

const gcpProvider = new gcp.Provider("gcp-provider", {
  zone: "us-central1",
});

const cluster = new gcp.container.Cluster(
  "comprehensive-turkey",
  {
    initialNodeCount: 1,
  },
  {
    provider: gcpProvider,
  }
);

const kubeconfig = pulumi
  .all([cluster.endpoint, cluster.masterAuth.clusterCaCertificate])
  .apply(
    ([endpoint, clusterCaCertificate]) => `apiVersion: v1
clusters:
  - cluster:
      certificate-authority-data: ${clusterCaCertificate}
      server: https://${endpoint}
    name: self-hosted-cluster
contexts:
  - context:
      cluster: self-hosted-cluster
      user: svcs-acct-dply
    name: svcs-acct-context
current-context: svcs-acct-context
kind: Config
users:
  - name: svcs-acct-dply
    user:
      auth-provider:
        config:
          cmd-args: config config-helper --format=json
          cmd-path: gcloud
          expiry-key: "{.credential.token_expiry}"
          token-key: "{.credential.access_token}"
        name: gcp`
  );

const k8sProvider = new k8s.Provider("k8s-provider", {
  kubeconfig,
});

const chart = "argocd";

const ns = new k8s.core.v1.Namespace(
  `${chart}-ns`,
  {
    metadata: { name: chart },
  },
  {
    provider: k8sProvider,
  }
);

Reflect.construct(k8s.helm.v3.Chart, [
  chart,
  {
    namespace: ns.metadata.name,
    path: `../charts/${chart}`,
  },
  {
    provider: k8sProvider,
  },
]);
