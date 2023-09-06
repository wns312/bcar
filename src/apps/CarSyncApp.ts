import { envs } from "../configs"
import { SheetClient, DynamoCarClient, DynamoCategoryClient, DynamoUploadedCarClient } from "../db"
import { CarUploadService, UploadedCarSyncService } from "../services"
import { CategoryInitializer, timer } from "../utils"

export class CarSyncApp {
  constructor(
    private uploadedCarSyncService: UploadedCarSyncService,
    private carUploadService: CarUploadService,
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
  ) {}

  @timer()
  async syncAndUploadCars(id: string) {
    await this.uploadedCarSyncService.syncCarsById(id)
    await this.carUploadService.uploadCarById(id)

    const carNumbersAfterUpload = await this.dynamoUploadedCarClient.queryCarNumbersByIdAndIsUploaded(id, false)
    if (carNumbersAfterUpload.length) {
      console.error("There is more cars to be uploaded. exit 1 for retry.")
      process.exit(1)
    }
  }
}

if (require.main == module) {
  (async ()=>{
    const id = process.env.KCR_ID
    if (!id) throw new Error("No id env")

    const {
      BCAR_CATEGORY_INDEX,
      BCAR_CATEGORY_TABLE,
      BCAR_INDEX,
      BCAR_TABLE,
      GOOGLE_CLIENT_EMAIL,
      GOOGLE_PRIVATE_KEY,
      REGION,
    } = envs
    const categoryInitializer = new CategoryInitializer(
      new DynamoCategoryClient(REGION, BCAR_CATEGORY_TABLE, BCAR_CATEGORY_INDEX)
    )
    const sheetClient = new SheetClient(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)
    const dynamoUploadedCarClient = new DynamoUploadedCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
    const dynamoCarClient = new DynamoCarClient(REGION, BCAR_TABLE, BCAR_INDEX)
    const uploadedCarSyncService = new UploadedCarSyncService(dynamoUploadedCarClient, sheetClient)
    const carUploadService = new CarUploadService(sheetClient, dynamoCarClient, dynamoUploadedCarClient, categoryInitializer)

    await new CarSyncApp(uploadedCarSyncService, carUploadService, dynamoUploadedCarClient).syncAndUploadCars(id)
  })()
}