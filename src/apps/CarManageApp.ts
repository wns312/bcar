import { CarSyncApp } from "."
import { BatchClient } from "../aws"
import { envs } from "../configs"
import { SheetClient, DynamoCarClient, DynamoCategoryClient, DynamoUploadedCarClient } from "../db"
import { CarAssignService } from "../services"
import { CategoryInitializer, timer } from "../utils"

export class CarManageApp {
  constructor(
    private sheetClient: SheetClient,
    private categoryInitializer: CategoryInitializer,
    private carAssignService: CarAssignService,
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
    private batchClient: BatchClient,
  ) {}

  @timer()
  async manageCars() {
    const accounts = await this.sheetClient.getAccounts()
    const { segmentMap, companyMap } = await this.categoryInitializer.initializeMaps()

    await this.carAssignService.releaseExceededCars(accounts, segmentMap, companyMap)
    await this.carAssignService.assignCars(accounts, segmentMap, companyMap)

    for (const account of accounts) {
      const carNumbersNotUploaded = await this.dynamoUploadedCarClient.queryCarNumbersByIdAndIsUploaded(account.id, false)
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

    // Repositories
    const dynamoCarClient = new DynamoCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
    const dynamoCategoryClient = new DynamoCategoryClient(REGION, BCAR_CATEGORY_TABLE, BCAR_CATEGORY_INDEX)
    const dynamoUploadedCarClient = new DynamoUploadedCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
    // SpreadSheet Client
    const sheetClient = new SheetClient(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)
    // Category Map Creator
    const categoryInitializer = new CategoryInitializer(dynamoCategoryClient)
    // Batch Trigger
    const batchClient = new BatchClient(REGION, JOB_DEFINITION_NAME, SYNC_JOB_QUEUE_NAME, UPLOAD_JOB_QUEUE_NAME)
    // Services
    const carAssignService = new CarAssignService(dynamoCarClient, dynamoUploadedCarClient)
    await new CarManageApp(
      sheetClient,
      categoryInitializer,
      carAssignService,
      dynamoUploadedCarClient,
      batchClient
    ).manageCars()
  })()
}
