import { BatchClient as _BatchClient, SubmitJobCommand, KeyValuePair } from "@aws-sdk/client-batch";
import { envs } from "../configs"

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
    return this.submitJob(id, `${functionName}-${id}`, ["node", "/app/dist/src/index.js", functionName])
  }

  async submitJob(id: string, jobName: string, command: string[]) {
    const input = new SubmitJobCommand({
      jobName,
      jobQueue: this.jobQueue,
      jobDefinition: this.jobDefinition,
      containerOverrides: {
        environment: [...this.environment, { name: "KCR_ID", value: id }],
        command
      }
    })

    const response = await this.client.send(input);
    return response
  }
}
