import { CategoryCollector } from "../automations"
import { SheetClient, DynamoCategoryClient } from "../db"

export class CategoryService {
  constructor(
    private sheetClient: SheetClient,
    private categoryCollector: CategoryCollector,
    private dynamoCategoryClient: DynamoCategoryClient,
  ) {}


  async collectCategoryInfo() {
    const { account, regionUrl } = await this.sheetClient.getTestAccountAndRegionUrl()
    await this.categoryCollector.execute(account.id, account.pw, regionUrl.loginUrl, regionUrl.registerUrl)

    const carManufacturerMap = this.categoryCollector.carManufacturerMap
    const carSegmentMap = this.categoryCollector.carSegmentMap

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
