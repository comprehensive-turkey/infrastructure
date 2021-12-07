import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import * as mongodbatlas from "@pulumi/mongodbatlas";

const {
  MONGODB_ATLAS_ORGID = "ZZZZZZZZZZZZZZ",
  MONGODB_USERPASS = "WWWWWWWWWWWWWW",
} = process.env;

const projectName = "comprehensive-turkey";
const clusterName = `${projectName}-cluster`;
const adminDatabaseName = "admin";
const dbUsername = "root";

const mongodbatlasProject = new mongodbatlas.Project(projectName, {
  orgId: MONGODB_ATLAS_ORGID,
});

const mongodbatlasCluster = new mongodbatlas.Cluster(clusterName, {
  projectId: mongodbatlasProject.id,
  providerName: "TENANT",
  providerInstanceSizeName: "M0",
  backingProviderName: "GCP",
  providerRegionName: "CENTRAL_US",
});

Reflect.construct(mongodbatlas.DatabaseUser, [
  `${projectName}-database-user`,
  {
    projectId: mongodbatlasProject.id,
    username: dbUsername,
    roles: [{ roleName: "atlasAdmin", databaseName: adminDatabaseName }],
    authDatabaseName: adminDatabaseName,
    password: MONGODB_USERPASS,
  },
]);

Reflect.construct(mongodbatlas.ProjectIpAccessList, [
  `${projectName}-project-ip-access-list`,
  {
    projectId: mongodbatlasProject.id,
    cidrBlock: "0.0.0.0/0",
  },
]);

const cluster = new gcp.container.Cluster(clusterName, {
  initialNodeCount: 1,
  location: "us-central1-c",
});

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

/* const chartValues = */ mongodbatlasCluster.mongoUri.apply((mongoUri) => ({
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

const chartNamespace = new kubernetes.core.v1.Namespace(
  chart,
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
    /* values: chartValues, */
  },
  {
    provider: kubernetesProvider,
  },
]);
