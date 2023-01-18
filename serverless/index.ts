import { APIGatewayEvent, Context } from "aws-lambda";
import { BatchClient,SubmitJobCommand } from "@aws-sdk/client-batch"

const envs = {
  JOB_DEFINITION_NAME: process.env.JOB_DEFINITION_NAME!,
  JOB_QUEUE_NAME: process.env.JOB_QUEUE_NAME!,
  REGION: process.env.REGION!,
}
if (!Object.values(envs).every(env => env)) {
  throw new Error('Required envs are not exist.')
  }

export async function manageCars(event: APIGatewayEvent,context: Context) {
  const batchClient = new BatchClient({ region: envs.REGION })
  const response = await batchClient.send(new SubmitJobCommand({
    jobName: manageCars.name,
    jobDefinition: envs.JOB_DEFINITION_NAME,
    jobQueue: envs.JOB_QUEUE_NAME,
    containerOverrides: {
      command: ["node","/app/dist/src/index.js",manageCars.name],
      resourceRequirements: [
        { type: "VCPU", value: "1.0" },
        { type: "MEMORY", value: "2048" },
      ]
    }
  }))
  console.log(response);
}

export async function checkIPAddress(event: APIGatewayEvent,context: Context) {
  const batchClient = new BatchClient({ region: envs.REGION })
  const response = await batchClient.send(new SubmitJobCommand({
    jobName: checkIPAddress.name,
    jobDefinition: envs.JOB_DEFINITION_NAME,
    jobQueue: envs.JOB_QUEUE_NAME,
    containerOverrides: {
      command: ["node","/app/dist/src/index.js",checkIPAddress.name],
      resourceRequirements: [
        { type: "VCPU", value: "0.25" },
        { type: "MEMORY", value: "512" },
      ]
    }
  }))
  console.log(response);
}

