import { SheetClient, DynamoCarClient, DynamoUploadedCarClient } from "../db"
import { Car, UploadedCar } from "../entities"
import { Account, RegionUrl } from "../entities"
import { CarClassifier, CategoryInitializer } from "../utils"

export class CarAssignService {

  static MAX_COUNT = 200

  constructor(
    private sheetClient: SheetClient,
    private dynamoCarClient: DynamoCarClient,
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
    private categoryInitializer: CategoryInitializer,
  ) {}

    private async getUnregisteredCars() {
    // [A, B]
    const [cars, uploadedCars] = await Promise.all([
      this.dynamoCarClient.queryCars(),
      this.dynamoUploadedCarClient.queryAll()
    ])
    console.log("rawCars: ", cars.length)
    console.log("rawuploadedCars: ", uploadedCars.length)

    const carMap = new Map<string, Car>(cars.map(car=>[car.carNumber, car]))
    const uploadedCarMap = new Map<string, UploadedCar>(uploadedCars.map(car=>[car.carNumber, car]))

    // A - B: 등록이 될 대상
    const unregisteredCars = cars.filter(car=>!uploadedCarMap.get(car.carNumber))
    // B - A: 삭제가 될 대상.
    const uploadedCarShouldBeDeleted = uploadedCars.filter(car=>!carMap.get(car.carNumber))

    if (uploadedCarShouldBeDeleted.length) {
      // Delete
      console.log(uploadedCarShouldBeDeleted);
      const deleteResults = await this.dynamoUploadedCarClient.batchDelete(uploadedCarShouldBeDeleted)
      console.log("Delete result: ");
      console.log(deleteResults);
    }

    // Convert to CarObject and return
    return unregisteredCars
  }

  async assign() {
    const [unregisteredCars, { segmentMap, companyMap }, accountMap] = await Promise.all([
      this.getUnregisteredCars(),
      this.categoryInitializer.initializeMaps(),
      this.sheetClient.getAccountIdMap(),
    ])

    const classifiedSources = new CarClassifier(unregisteredCars, segmentMap, companyMap).classifyAll()
    let classifiedCarNums = classifiedSources.map(source=>source.car.carNumber.toString())
    console.log(classifiedCarNums);

    const userIds = Array.from(accountMap.keys())

    for (const id of userIds) {
      console.log(id);
      const amountCanAssign = classifiedCarNums.length
      if (!amountCanAssign) {
        console.log("No more cars to assign.");
        break
      }

      // Select 추가
      const uploadedCars = await this.dynamoUploadedCarClient.queryById(id)

      const amountToAssign = CarAssignService.MAX_COUNT - uploadedCars.length
      console.log("amountToAssign", amountToAssign);

      if (amountToAssign <= 0) {
        console.log(`Account ${id} is fully assigned.`);
        continue
      }

      const spliceStartIndex = amountToAssign < amountCanAssign ? amountCanAssign-amountToAssign : 0
      const splicedCars = classifiedCarNums.splice(spliceStartIndex)
      const responses = await this.dynamoUploadedCarClient.batchSaveByCarNumbers(id, splicedCars, false)
      responses.forEach(response=> {
        if (response.$metadata.httpStatusCode !== 200) {
          console.log(response)
        }
      })
    }
  }
}
