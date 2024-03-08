import { BatchClient as _BatchClient, SubmitJobCommand, KeyValuePair } from "@aws-sdk/client-batch";
import { envs } from "../configs"

interface SubmitJobCommandInput {
  jobName: string
  command?: string[]
  environment?: KeyValuePair[]
  vcpu?: number
  memory?: number
  timeout?: number
  attempts?: number
}

export class BatchClient {
  private client: _BatchClient
  private environment: KeyValuePair[]

  constructor(
    private region: string,
    private jobDefinition: string,
    private syncJobQueue: string,
    private uploadJobQueue: string,
  ) {
    this.client = new _BatchClient({ region: this.region });
    this.environment = Object.entries(envs).map(([name, value])=>({ name, value }))
  }

  async submitFunction(id: string, functionName: string) {
    return this.submitSyncJob({
      jobName: `${functionName}-${id}`,
      environment: [{ name: "KCR_ID", value: id }],
      command: ["node", "/app/dist/src/index.js", functionName]
    })
  }

  private async submitJob(jobQueue: string, options: SubmitJobCommandInput) {
    const { jobName, environment, command, vcpu, memory, timeout, attempts } = options
    const input = new SubmitJobCommand({
      jobName,
      jobQueue,
      jobDefinition: this.jobDefinition,
      timeout: { attemptDurationSeconds : timeout ? timeout : 900 },
      retryStrategy: { attempts: attempts ? attempts : 1},
      containerOverrides: {
        command,
        environment: environment,
        resourceRequirements: (vcpu && memory) ? [
          { type: "VCPU", value: vcpu.toString() },
          { type: "MEMORY", value: memory.toString()}
        ] : undefined
      }
    })

    const response = await this.client.send(input);
    return response
  }

  async submitSyncJob(options: SubmitJobCommandInput) {
    const response = await this.submitJob(this.syncJobQueue, options)
    if (response.$metadata.httpStatusCode !== 200) {
      console.error(response)
    }
    return response
  }

  async submitUploadJob(options: SubmitJobCommandInput) {
    return this.submitJob(this.uploadJobQueue, options)
  }
}
