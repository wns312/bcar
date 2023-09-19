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
    this.carAssignService = new CarAssignService(dynamoCarClient, sheetClient)
  }

  @timer()
  async assign() {
    const accounts = await this.sheetClient.getAccounts()
    const { segmentMap, companyMap } = await this.categoryInitializer.initializeMaps()
    await this.carAssignService.releaseCars(accounts, segmentMap, companyMap)
    await this.carAssignService.assignCars(accounts, segmentMap, companyMap)
    if (envs.NODE_ENV != "prod") return
    const assignedCars = await this.dynamoCarClient.queryAssignedCars()
    const carMap = CarAssignService.categorizeCarsByAccountId(assignedCars)
    for (const account of accounts) {
      if (!carMap.has(account.id)) continue
      const accountCars = carMap.get(account.id)!
      const notUploadedAccountCars = accountCars.filter(car=>!car.isUploaded)
      if (!notUploadedAccountCars.length) {
        console.log(`${account.id} has nothing to upload`)
        continue
      }
      await this.batchClient.submitUploadJob({
        jobName: `syncAndUploadCars-${account.id}`,
        command: ["node", `/app/dist/src/apps/${CarSyncApp.name}.js`],
        environment: [{ name: "KCR_ID", value: account.id }],
        timeout: 60 * 20,
        attempts: 3
      })
    }
  }
}

if (require.main == module) {
  (async ()=>{
    const {
      BCAR_CATEGORY_TABLE,
      BCAR_TABLE,
      GOOGLE_CLIENT_EMAIL,
      GOOGLE_PRIVATE_KEY,
      JOB_DEFINITION_NAME,
      SYNC_JOB_QUEUE_NAME,
      UPLOAD_JOB_QUEUE_NAME,
      REGION,
    } = envs

    const sheetClient = new SheetClient(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)
    const dynamoCarClient = new DynamoCarClient(REGION, BCAR_TABLE)
    const dynamoCategoryClient = new DynamoCategoryClient(REGION, BCAR_CATEGORY_TABLE)
    const batchClient = new BatchClient(REGION, JOB_DEFINITION_NAME, SYNC_JOB_QUEUE_NAME, UPLOAD_JOB_QUEUE_NAME)
    // Category Map Creator
    const categoryInitializer = new CategoryInitializer(dynamoCategoryClient)

    await new CarAssignApp(sheetClient, categoryInitializer, dynamoCarClient, batchClient).assign()
  })()
}
