import { DetailCollector, DraftCollector } from "../automations"
import { DynamoCarClient } from "../db"
import { DraftCar, Car } from "../entities"
import { chunk } from "../utils"

export class CarCollectService {

  constructor(
    private draftCollector: DraftCollector,
    private detailCollector: DetailCollector,
    private dynamoCarClient: DynamoCarClient,
  ) {}

  filterDrafts(draftCars: DraftCar[], cars: Car[]) {
    const carMap = new Map<string, Car>(cars.map(car=>[car.carNumber, car]))
    const draftCarMap = new Map<string, DraftCar>(draftCars.map(draftCar=>[draftCar.carNumber, draftCar]))

    const draftCarShouldCrawl = draftCars.filter(draftCar=>!carMap.get(draftCar.carNumber))
    const carsShouldDelete = cars.filter(car=>!draftCarMap.get(car.carNumber))
    return { carsShouldDelete, draftCarShouldCrawl }
  }

  async collectDrafts() {
    const existingDraftCars = await this.dynamoCarClient.queryDrafts()
    if (existingDraftCars.length) await this.dynamoCarClient.batchDeleteDrafts(existingDraftCars)

    const cars = await this.dynamoCarClient.queryCars()
    const draftCars = await this.draftCollector.collectDraftCars()

    const { carsShouldDelete, draftCarShouldCrawl } = this.filterDrafts(draftCars, cars)

    await this.dynamoCarClient.batchSaveDraft(draftCarShouldCrawl)
    await this.dynamoCarClient.batchDeleteCars(carsShouldDelete)

    return Boolean(draftCarShouldCrawl.length) || Boolean(carsShouldDelete.length)
  }

  async collectDetails() {
    const draftCars = await this.dynamoCarClient.queryDrafts()
    console.log(draftCars.length)

    if (!draftCars.length) {
      return
    }

    await this.detailCollector.checkDetailKey(draftCars[0])
    const chunks = chunk(draftCars, 100)

    for (let i = 0; i < chunks.length; i++) {
      const draftCarsChunk = chunks[i]
      console.log(`${i + 1} / ${chunks.length}`)
      const cars = await this.detailCollector.collectDetails(draftCarsChunk)

      const [saveResponse] = await this.dynamoCarClient.batchSaveCar(cars)
      const [deleteResponse] = await this.dynamoCarClient.batchDeleteDrafts(draftCarsChunk)

      if (saveResponse.$metadata.httpStatusCode !== 200) {
        console.log(saveResponse)
      }
      if (deleteResponse.$metadata.httpStatusCode !== 200) {
        console.log(deleteResponse)
      }
    }
  }
}
