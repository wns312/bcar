import { CarAssignApp } from "."
import { BatchClient } from "../aws"
import { envs } from "../configs"
import { DynamoCarClient, DynamoCategoryClient, SheetClient } from "../db"
import { CategoryInitializer, timer } from "../utils"

export class CarReassignApp {
  constructor(private dynamoCarClient: DynamoCarClient, private batchClient: BatchClient) {}

  @timer()
  async run() {
    const cars = await this.dynamoCarClient.queryAssignedCars()
    cars.forEach(car => {
      car.uploader = "null"
      car.isUploaded = false
    })

    await this.dynamoCarClient.batchSaveCar(cars)
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
    const dynamoCarClient = new DynamoCarClient(REGION, BCAR_TABLE)
    const batchClient = new BatchClient(REGION, JOB_DEFINITION_NAME, SYNC_JOB_QUEUE_NAME, UPLOAD_JOB_QUEUE_NAME)

    const sheetClient = new SheetClient(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)
    const dynamoCategoryClient = new DynamoCategoryClient(REGION, BCAR_CATEGORY_TABLE)
    // Category Map Creator
    const categoryInitializer = new CategoryInitializer(dynamoCategoryClient)

    await new CarReassignApp(dynamoCarClient, batchClient).run()
    await new CarAssignApp(sheetClient, categoryInitializer, dynamoCarClient, batchClient).assign()
  })()
}
