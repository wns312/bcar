import { CategoryCollector } from "../automations"
import { envs } from "../configs"
import { SheetClient, DynamoCategoryClient } from "../db"
import { CategoryService } from "../services"
import { timer } from "../utils"

export class CategoryCollectorApp {
  constructor(private categoryService: CategoryService) {}

  @timer()
  async collectCategory() {
    await this.categoryService.collectCategoryInfo()
  }
}

if (require.main == module) {
  (async ()=>{
    const {
      BCAR_CATEGORY_INDEX,
      BCAR_CATEGORY_TABLE,
      GOOGLE_CLIENT_EMAIL,
      GOOGLE_PRIVATE_KEY,
      REGION,
    } = envs
    const categoryCollector = new CategoryCollector()
    const dynamoCategoryClient = new DynamoCategoryClient(REGION, BCAR_CATEGORY_TABLE, BCAR_CATEGORY_INDEX)
    const sheetClient = new SheetClient(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)
    const categoryService = new CategoryService(sheetClient, categoryCollector, dynamoCategoryClient)

    await new CategoryCollectorApp(categoryService).collectCategory()
  })()
}
