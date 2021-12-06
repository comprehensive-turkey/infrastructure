import * as gcp from "@pulumi/gcp";
import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { config } from "dotenv";
import * as mongodbatlas from "@pulumi/mongodbatlas";

config();

const {
  MONGODB_ATLAS_PUBKEY = "XXXXXXXXXXXXXX",
  MONGODB_ATLAS_PRIVKEY = "YYYYYYYYYYYYYY",
  MONGODB_ATLAS_ORGID = "ZZZZZZZZZZZZZZ",
  MONGODB_USERPASS = "WWWWWWWWWWWWWW",
} = process.env;

const projectName = "comprehensive-turkey";
const clusterName = `${projectName}-cluster`;
const adminDatabaseName = "admin";
const dbUsername = "root";

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
  clusterName,
  {
    projectId: mongodbatlasProject.id,
    providerName: "TENANT",
    providerInstanceSizeName: "M0",
    backingProviderName: "GCP",
    providerRegionName: "CENTRAL_US",
  },
  { provider: mongodbatlasProvider }
);

// const MONGODB_USERPASS = (
//   Date.now() + (Math.random() < 0.5 ? Math.random() : -Math.random())
// ).toString(36);

Reflect.construct(mongodbatlas.DatabaseUser, [
  `${projectName}-database-user`,
  {
    projectId: mongodbatlasProject.id,
    username: dbUsername,
    roles: [{ roleName: "atlasAdmin", databaseName: adminDatabaseName }],
    authDatabaseName: adminDatabaseName,
    password: MONGODB_USERPASS,
  },
  { provider: mongodbatlasProvider },
]);

Reflect.construct(mongodbatlas.ProjectIpAccessList, [
  `${projectName}-project-ip-access-list`,
  {
    projectId: mongodbatlasProject.id,
    cidrBlock: "0.0.0.0/0",
  },
  {
    provider: mongodbatlasProvider,
  },
]);

const gcpProvider = new gcp.Provider("gcp-provider", {
  zone: "us-central1",
});

const cluster = new gcp.container.Cluster(
  clusterName,
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

const kubernetesProvider = new kubernetes.Provider("kubernetes-provider", {
  kubeconfig,
});

const chart = "argocd";

const chartValues = mongodbatlasCluster.mongoUri.apply((mongoUri) => ({
  secrets: {
    "db-credentials": {
      data: {
        mongo_uri: Buffer.from(mongoUri).toString("base64"),
        mongo_username: Buffer.from(dbUsername).toString("base64"),
        mongo_userpass: Buffer.from(MONGODB_USERPASS).toString("base64"),
      },
      namespace: "url-shortner-microservices",
    },
  },
}));

// To-do: uncomment this part (https://github.com/pulumi/pulumi-kubernetes/pull/1809)
/*
Reflect.construct(kubernetes.helm.v3.Release, [
  chart,
  {
    chart,
    namespace: chart,
    createNamespace: true,
    values: chartValues,
  },
  {
    provider: kubernetesProvider,
  },
]);
*/

// To-do: remove the next 2 code snpiiets in favour of the above one
const chartNamespace = new kubernetes.core.v1.Namespace(
  `${chart}-ns`,
  {
    metadata: { name: chart },
  },
  {
    provider: kubernetesProvider,
  }
);

Reflect.construct(kubernetes.helm.v3.Chart, [
  chart,
  {
    namespace: chartNamespace.metadata.name,
    path: `../${chart}`,
    values: chartValues,
  },
  {
    provider: kubernetesProvider,
  },
]);
