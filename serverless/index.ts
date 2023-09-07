import { APIGatewayEvent, Context } from "aws-lambda";
import { BatchClient,SubmitJobCommand } from "@aws-sdk/client-batch"

const envs = {
  JOB_DEFINITION_NAME: process.env.JOB_DEFINITION_NAME!,
  SYNC_JOB_QUEUE_NAME: process.env.SYNC_JOB_QUEUE_NAME!,
  UPLOAD_JOB_QUEUE_NAME: process.env.UPLOAD_JOB_QUEUE_NAME!,
  REGION: process.env.REGION!,
}

if (!Object.values(envs).every(env => env)) {
  throw new Error('Required envs are not exist.')
}

export async function collectDrafts(event: APIGatewayEvent, context: Context) {
  const batchClient = new BatchClient({ region: envs.REGION })
  const response = await batchClient.send(new SubmitJobCommand({
    jobName: collectDrafts.name,
    jobDefinition: envs.JOB_DEFINITION_NAME,
    jobQueue: envs.SYNC_JOB_QUEUE_NAME,
    containerOverrides: {
      command: ["node","/app/dist/src/apps/DraftCollectorApp.js"],
    },
    retryStrategy: { attempts: 3 },
  }))
  console.log(response)
}

export async function manageCars(event: APIGatewayEvent, context: Context) {
  const batchClient = new BatchClient({ region: envs.REGION })
  const response = await batchClient.send(new SubmitJobCommand({
    jobName: manageCars.name,
    jobDefinition: envs.JOB_DEFINITION_NAME,
    jobQueue: envs.SYNC_JOB_QUEUE_NAME,
    containerOverrides: {
      command: ["node","/app/dist/src/apps/CarAssignApp.js"],
      resourceRequirements: [
        { type: "VCPU", value: "1.0" },
        { type: "MEMORY", value: "2048" },
      ]
    }
  }))
  console.log(response)
}

