import { envs } from "../configs"
import { DynamoCarClient } from "../db"
import { timer } from "../utils"

export class CarUnassignApp {
  constructor(private dynamoCarClient: DynamoCarClient) {}

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
    const { REGION, BCAR_TABLE } = envs
    const dynamoCarClient = new DynamoCarClient(REGION, BCAR_TABLE)
    await new CarUnassignApp(dynamoCarClient).run()
  })()
}
