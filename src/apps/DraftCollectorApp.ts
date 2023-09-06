import { DetailCollectorApp } from "."
import { DetailCollector, DraftCollector } from "../automations"
import { BatchClient } from "../aws"
import { envs } from "../configs"
import { DynamoCarClient } from "../db"
import { CarCollectService } from "../services"
import { timer } from "../utils"

export class DraftCollectorApp {
  constructor(private carCollectService: CarCollectService, private batchClient: BatchClient) {}

  @timer()
  async collectDrafts() {
    const shouldTriggerDetail = await this.carCollectService.collectDrafts()
    if (!shouldTriggerDetail) {
      console.log("Nothing cars have been changed. end execution.")
      return
    }
    const response = await this.batchClient.submitSyncJob({
      jobName: "collectDetails",
      command: ["node", `/app/dist/src/apps/${DetailCollectorApp.name}.js`],
      timeout: 60 * 30,
      attempts: 3
    })
    console.log(response)
  }
}

if (require.main == module) {
  (async ()=>{
    const {
      BCAR_INDEX,
      BCAR_TABLE,
      REGION,
      SOURCE_ADMIN_ID,
      SOURCE_ADMIN_PW,
      SOURCE_LOGIN_PAGE,
      SOURCE_MANAGE_PAGE,
      SOURCE_SEARCH_BASE,
      SOURCE_SEARCH_TRUCK_BASE,
      SOURCE_SEARCH_BUS_BASE,
      JOB_DEFINITION_NAME,
      SYNC_JOB_QUEUE_NAME,
      UPLOAD_JOB_QUEUE_NAME
    } = envs
    const draftCollector = new DraftCollector(
      SOURCE_ADMIN_ID,
      SOURCE_ADMIN_PW,
      SOURCE_LOGIN_PAGE,
      SOURCE_MANAGE_PAGE,
      SOURCE_SEARCH_BASE,
      SOURCE_SEARCH_TRUCK_BASE,
      SOURCE_SEARCH_BUS_BASE,
      )
    const dynamoCarClient = new DynamoCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
    const carCollectService = new CarCollectService(draftCollector, new DetailCollector(), dynamoCarClient)
    const batchClient = new BatchClient(REGION, JOB_DEFINITION_NAME, SYNC_JOB_QUEUE_NAME, UPLOAD_JOB_QUEUE_NAME)
    await new DraftCollectorApp(carCollectService, batchClient).collectDrafts()
  })()
}
