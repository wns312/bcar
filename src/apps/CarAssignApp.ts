import { CarSyncApp } from "."
import { BatchClient } from "../aws"
import { envs } from "../configs"
import { SheetClient, DynamoCarClient, DynamoCategoryClient } from "../db"
import { CarAssignService } from "../services"
import { CategoryInitializer, timer } from "../utils"

export class CarAssignApp {
  private carAssignService: CarAssignService
  constructor(
    private sheetClient: SheetClient,
    private categoryInitializer: CategoryInitializer,
    private dynamoCarClient: DynamoCarClient,
    private batchClient: BatchClient,
  ) {
    this.carAssignService = new CarAssignService(dynamoCarClient)
  }

  @timer()
  async manageCars() {
    const accounts = await this.sheetClient.getAccounts()
    const { segmentMap, companyMap } = await this.categoryInitializer.initializeMaps()

    await this.carAssignService.assignCars(accounts, segmentMap, companyMap)

    for (const account of accounts) {
      const carNumbersNotUploaded = await this.dynamoCarClient.queryNotUploadedCarsByUploader(account.id)
      if (!carNumbersNotUploaded.length) {
        console.log(`${account.id} has nothing to upload`)
        continue
      }

      await this.batchClient.submitUploadJob({
        jobName: `syncAndUploadCars-${account.id}`,
        command: ["node", `/app/dist/src/apps/${CarSyncApp.name}.js`],
        environment: [{ name: "KCR_ID", value: account.id }],
        timeout: 60 * 30,
        attempts: 3
      })
    }
  }
}

if (require.main == module) {
  (async ()=>{
    const {
      BCAR_CATEGORY_INDEX,
      BCAR_CATEGORY_TABLE,
      BCAR_INDEX,
      BCAR_TABLE,
      GOOGLE_CLIENT_EMAIL,
      GOOGLE_PRIVATE_KEY,
      JOB_DEFINITION_NAME,
      SYNC_JOB_QUEUE_NAME,
      UPLOAD_JOB_QUEUE_NAME,
      REGION,
    } = envs

    const sheetClient = new SheetClient(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)
    const dynamoCarClient = new DynamoCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
    const dynamoCategoryClient = new DynamoCategoryClient(REGION, BCAR_CATEGORY_TABLE, BCAR_CATEGORY_INDEX)
    const batchClient = new BatchClient(REGION, JOB_DEFINITION_NAME, SYNC_JOB_QUEUE_NAME, UPLOAD_JOB_QUEUE_NAME)
    // Category Map Creator
    const categoryInitializer = new CategoryInitializer(dynamoCategoryClient)

    await new CarAssignApp(sheetClient, categoryInitializer, dynamoCarClient, batchClient).manageCars()
  })()
}
