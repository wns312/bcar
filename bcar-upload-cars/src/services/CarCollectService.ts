import { DetailCollector, DraftCollector } from "../automations"
import { DynamoCarClient } from "../db"
import { DraftCar } from "../entities"
import { chunk } from "../utils"

export class CarCollectService {

  constructor(
    private draftCollector: DraftCollector,
    private detailCollector: DetailCollector,
    private dynamoCarClient: DynamoCarClient,
  ) {}

  filterDrafts(draftCars: DraftCar[], carNumbers: string[]) {
    const carMap = new Map<string, boolean>(carNumbers.map(carNumber=>[carNumber, true]))
    const draftCarMap = new Map<string, DraftCar>(draftCars.map(draftCar=>[draftCar.carNumber, draftCar]))

    const draftCarShouldCrawl = draftCars.filter(draftCar=>!carMap.get(draftCar.carNumber))
    const carsShouldDelete = carNumbers.filter(carNumber=>!draftCarMap.get(carNumber))
    return { carsShouldDelete, draftCarShouldCrawl }
  }

  async collectDrafts() {
    const rawDrafts = await this.dynamoCarClient.queryDrafts(["carNumber"])
    if (rawDrafts.length) {
      await this.dynamoCarClient.batchDeleteDrafts(rawDrafts.map(result=>result.carNumber.S!))
    }

    const rawCars = await this.dynamoCarClient.queryCars(["carNumber"])
    const carNumbers = rawCars.map(record=>record.carNumber.S!)

    console.log("Existing drafts :", rawDrafts.length);
    console.log("Existing cars :", rawCars.length);

    const draftCars = await this.draftCollector.collectDraftCars()

    const { carsShouldDelete, draftCarShouldCrawl } = this.filterDrafts(draftCars, carNumbers)

    console.log("draftCarShouldCrawl: ", draftCarShouldCrawl.map(draftCar=>draftCar.carNumber))
    console.log("carsShouldDelete : ", carsShouldDelete)

    if (draftCarShouldCrawl.length) {
      const draftSaveResponses = await this.dynamoCarClient.batchSaveDraft(draftCarShouldCrawl)
      console.log("Draft save responses :", draftSaveResponses)
    }

    if (carsShouldDelete.length) {
      const deleteresponses = await this.dynamoCarClient.batchDeleteCars(carsShouldDelete)
      console.log("Delete response :", deleteresponses)
    }
    return draftCarShouldCrawl.length
  }

  async collectDetails() {
    const rawDrafts = await this.dynamoCarClient.queryDrafts()
    console.log(rawDrafts.length)

    if (!rawDrafts.length) {
      return
    }

    const draftCars = rawDrafts.map(({company, carNumber, price, detailPageNum, title}) =>
      new DraftCar({
        company: company.S!,
        carNumber: carNumber.S!,
        price: Number.parseInt(price.N!),
        detailPageNum: detailPageNum.S!,
        title: title.S!
      })
    )

    await this.detailCollector.checkDetailKey(draftCars[0])
    const chunks = chunk(draftCars, 100)

    for (let i = 0; i < chunks.length; i++) {
      console.log(`${i + 1} / ${chunks.length}`)
      const cars = await this.detailCollector.collectDetails(chunks[i])

      const [saveResponse] = await this.dynamoCarClient.batchSaveCar(cars)
      const carNumbers = chunks[i].map(draft=>draft.carNumber)
      const [deleteResponse] = await this.dynamoCarClient.batchDeleteDrafts(carNumbers)

      if (saveResponse.$metadata.httpStatusCode !== 200) {
        console.log(saveResponse)
      }
      if (deleteResponse.$metadata.httpStatusCode !== 200) {
        console.log(deleteResponse)
      }
    }
  }
}
