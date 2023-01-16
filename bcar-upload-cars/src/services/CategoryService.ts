import { CategoryCrawler } from "../automations"
import { SheetClient, DynamoCategoryClient } from "../db"

export class CategoryService {
  constructor(
    private sheetClient: SheetClient,
    private categoryCrawler: CategoryCrawler,
    private dynamoCategoryClient: DynamoCategoryClient,
  ) {}


  async collectCategoryInfo() {
    const accounts = await this.sheetClient.getAccounts()
    const { id, pw, region } = accounts[0]
    const urls = await this.sheetClient.getKcrs()
    const url = urls.find(url=>url.region === region)
    if (!url) throw new Error("No proper url");
    const { loginUrl, registerUrl } = url

    await this.categoryCrawler.execute(id, pw, loginUrl, registerUrl)

    const carManufacturerMap = this.categoryCrawler.carManufacturerMap
    const carSegmentMap = this.categoryCrawler.carSegmentMap

    const carSegmentResult = await this.dynamoCategoryClient.saveSegments(carSegmentMap)
    const carManufacturerResult = await this.dynamoCategoryClient.saveCompanies(carManufacturerMap)
    const carModelResult = await this.dynamoCategoryClient.saveModels(carManufacturerMap)
    const carDetailResult = await this.dynamoCategoryClient.saveDetailModels(carManufacturerMap)

    carSegmentResult.forEach(r => console.log(r))
    carManufacturerResult.forEach(r => console.log(r))
    carModelResult.forEach(r => console.log(r))
    carDetailResult.forEach(r => console.log(r))

  }
}
