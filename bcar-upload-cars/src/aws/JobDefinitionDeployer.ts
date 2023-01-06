// AWS Batch > 작업 정의 > 세부 정보 에서 구성 정보 템플릿 확인 가능
import {
  AssignPublicIp,
  BatchClient,
  JobDefinitionType,
  LogDriver,
  PlatformCapability,
  RegisterJobDefinitionCommand,
  ResourceType
} from "@aws-sdk/client-batch";
import { envs, deployEnvs } from "../configs"

const MINUTE = 60
const {
  JOB_DEFINITION_NAME,
  PRIVATE_REGISTRY_BASE_URL,
  PRIVATE_REGISTRY_PATH,
  REGION,
  TAG_NAME,
  TASK_EXECUTION_ROLE_ARN,
} = deployEnvs

const client = new BatchClient({ region: REGION });
const registerCommand = new RegisterJobDefinitionCommand({
  type: JobDefinitionType.Container,
  jobDefinitionName: JOB_DEFINITION_NAME,
  platformCapabilities: [PlatformCapability.FARGATE],
  timeout: {
    attemptDurationSeconds: 15 * MINUTE
  },
  containerProperties: {
    image: `${PRIVATE_REGISTRY_BASE_URL}/${PRIVATE_REGISTRY_PATH}:${TAG_NAME}`,
    executionRoleArn: TASK_EXECUTION_ROLE_ARN,
    jobRoleArn: TASK_EXECUTION_ROLE_ARN,
    user: "root",
    resourceRequirements: [
      {
        type: ResourceType.VCPU,
        value: "2.0"
      },
      {
        type: ResourceType.MEMORY,
        value: "4096"
      }
    ],
    linuxParameters: {
      initProcessEnabled: false
    },
    logConfiguration: {
      logDriver: LogDriver.AWSLOGS
    },
    networkConfiguration: {
      assignPublicIp: AssignPublicIp.ENABLED
    },
    fargatePlatformConfiguration: {
      platformVersion: "LATEST"
    },
    environment: Object.entries(envs).map(([name, value])=>({
      name,
      value: name === 'NODE_ENV' ? "prod" : value
    })),
    command: ["node","/app/dist/src/index.js","testUpdateCars"],
  }
});

(async ()=>{
    const response = await client.send(registerCommand);
    console.log(response);
})()
