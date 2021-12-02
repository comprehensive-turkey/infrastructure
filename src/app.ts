import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { config } from "dotenv";
import * as mongodbatlas from "@pulumi/mongodbatlas";

config();

const {
  MONGODB_ATLAS_PUBKEY = "XXXXXXXXXXXXXX",
  MONGODB_ATLAS_PRIVKEY = "YYYYYYYYYYYYYY",
  MONGODB_ATLAS_ORGID = "ZZZZZZZZZZZZZZ",
} = process.env;

const projectName = "comprehensive-turkey";

const mongodbatlasProvider = new mongodbatlas.Provider(
  "mongodbatlas-provider",
  {
    publicKey: MONGODB_ATLAS_PUBKEY,
    privateKey: MONGODB_ATLAS_PRIVKEY,
  }
);

const mongodbatlasProject = new mongodbatlas.Project(
  projectName,
  { orgId: MONGODB_ATLAS_ORGID },
  { provider: mongodbatlasProvider }
);

const mongodbatlasCluster = new mongodbatlas.Cluster(
  projectName,
  {
    projectId: mongodbatlasProject.id,
    providerName: "TENANT",
    providerInstanceSizeName: "M0",
    backingProviderName: "GCP",
    providerRegionName: "CENTRAL_US",
  },
  { provider: mongodbatlasProvider }
);

const databaseUserName = "admin";
const adminDatabaseName = "admin";

const mongodbatlasDatabaseUser = new mongodbatlas.DatabaseUser(
  databaseUserName,
  {
    projectId: mongodbatlasProject.id,
    username: databaseUserName,
    roles: [{ roleName: "atlasAdmin", databaseName: adminDatabaseName }],
    authDatabaseName: adminDatabaseName,
    password: "test",
  },
  { provider: mongodbatlasProvider }
);

const mongodbatlasProjectIpAccessList = new mongodbatlas.ProjectIpAccessList(
  projectName,
  {
    projectId: mongodbatlasProject.id,
    cidrBlock: "0.0.0.0/0",
  },
  {
    provider: mongodbatlasProvider,
  }
);

const gcpProvider = new gcp.Provider("gcp-provider", {
  zone: "us-central1",
});

const cluster = new gcp.container.Cluster(
  projectName,
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

const charts = ["sops", "argocd"];

charts.forEach((chart) => {
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
});
