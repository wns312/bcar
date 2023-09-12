import { envs } from "../configs"
import { SheetClient, DynamoCarClient, DynamoCategoryClient } from "../db"
import { CarUploadService, UploadedCarSyncService } from "../services"
import { CategoryInitializer, timer } from "../utils"

export class CarSyncApp {
  constructor(
    private uploadedCarSyncService: UploadedCarSyncService,
    private carUploadService: CarUploadService,
    private dynamoCarClient: DynamoCarClient,
  ) {}

  @timer()
  async syncAndUploadCars(id: string) {
    for (let i = 0; i < 3; i++) {
      await this.uploadedCarSyncService.syncCarsById(id)
      await this.carUploadService.uploadCarById(id)
      const carNumbersAfterUpload = await this.dynamoCarClient.queryAssignedAndNotUploadedCarsByUploader(id)
      if (carNumbersAfterUpload.length === 0) return
      console.error(`There is more cars to be uploaded. retry: ${i+1}`)
    }
    process.exit(1)
  }
}

if (require.main == module) {
  (async ()=>{
    const id = process.env.KCR_ID
    if (!id) throw new Error("No id env")

    const {
      BCAR_CATEGORY_TABLE,
      BCAR_TABLE,
      GOOGLE_CLIENT_EMAIL,
      GOOGLE_PRIVATE_KEY,
      REGION,
    } = envs
    const categoryInitializer = new CategoryInitializer(
      new DynamoCategoryClient(REGION, BCAR_CATEGORY_TABLE)
    )
    const sheetClient = new SheetClient(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)
    const dynamoCarClient = new DynamoCarClient(REGION, BCAR_TABLE)
    const uploadedCarSyncService = new UploadedCarSyncService(dynamoCarClient, sheetClient)
    const carUploadService = new CarUploadService(sheetClient, dynamoCarClient, categoryInitializer)

    await new CarSyncApp(uploadedCarSyncService, carUploadService, dynamoCarClient).syncAndUploadCars(id)
  })()
}
