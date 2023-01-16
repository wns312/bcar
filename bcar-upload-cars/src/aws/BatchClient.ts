import { BatchClient as _BatchClient, SubmitJobCommand } from "@aws-sdk/client-batch";
import { envs } from "../configs"

export class BatchClient {
  private client: _BatchClient

  constructor(
    private region: string,
    private jobDefinition: string,
    private jobQueue: string,
  ) {
    this.client = new _BatchClient({ region: this.region });
  }

  async submitJob(id: string, jobName: string, command: string[]) {
    const environment = Object.entries(envs).map(([name, value])=>({
      name,
      value: name === 'NODE_ENV' ? "prod" : value
    }))
    environment.push({ name: "KCR_ID", value: id })

    const input = new SubmitJobCommand({
      jobName,
      jobQueue: this.jobQueue,
      jobDefinition: this.jobDefinition,
      containerOverrides: {
        environment,
        command
      }
    })

    const response = await this.client.send(input);
    return response
  }
}
