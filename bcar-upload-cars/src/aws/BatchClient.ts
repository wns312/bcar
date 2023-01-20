import { BatchClient as _BatchClient, SubmitJobCommand, KeyValuePair } from "@aws-sdk/client-batch";
import { envs } from "../configs"

interface SubmitJobCommandOption {
  command?: string[]
  environment?: KeyValuePair[]
  vcpu?: number
  memory?: number
  timeout?: number
}

export class BatchClient {
  private client: _BatchClient
  private environment: KeyValuePair[]

  constructor(
    private region: string,
    private jobDefinition: string,
    private jobQueue: string,
  ) {
    this.client = new _BatchClient({ region: this.region });
    this.environment = Object.entries(envs).map(([name, value])=>({ name, value }))
  }

  async submitFunction(id: string, functionName: string) {
    return this.submitJob(`${functionName}-${id}`, {
      environment: [{ name: "KCR_ID", value: id }],
      command: ["node", "/app/dist/src/index.js", functionName]
    })
  }

  async submitJob(jobName: string, options: SubmitJobCommandOption = {}) {
    const { environment, command, vcpu, memory, timeout } = options
    const input = new SubmitJobCommand({
      jobName,
      jobQueue: this.jobQueue,
      jobDefinition: this.jobDefinition,
      timeout: { attemptDurationSeconds : timeout ? timeout : 900 },
      containerOverrides: {
        environment: [...this.environment, ...environment || [], {
          name: "NODE_ENV",
          value: "prod"
        }],
        command,
        resourceRequirements: (vcpu && memory) ? [
          { type: "VCPU", value: vcpu.toString() },
          { type: "MEMORY", value: memory.toString()}
        ] : undefined
      }
    })

    const response = await this.client.send(input);
    return response
  }
}
