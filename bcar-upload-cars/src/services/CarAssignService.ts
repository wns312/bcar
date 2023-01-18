import { AttributeValue } from "@aws-sdk/client-dynamodb"
import { SheetClient, DynamoCarClient, DynamoUploadedCarClient } from "../db"
import { Account, CarDataObject, KCRURL } from "../types"
import { CarClassifier, CategoryInitializer } from "../utils"

export class CarAssignService {

  static MAX_COUNT = 200
  _accountMap?: Map<string, Account>
  _urlMap?: Map<string, KCRURL>

  constructor(
    private sheetClient: SheetClient,
    private dynamoCarClient: DynamoCarClient,
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
    private categoryInitializer: CategoryInitializer,
  ) {}

  private static createCarObject(items: Record<string, AttributeValue>[]): CarDataObject[] {
      return items.map(item=>{
        return {
          PK: item.PK.S!,
          SK: item.SK.S!,
          carCheckSrc: item.CarCheckSrc.S!,
          modelYear: item.ModelYear.S!,
          presentationsDate: item.PresentationsDate.S!,
          displacement: item.Displacement.S!,
          mileage: item.Mileage.S!,
          carImgList: item.CarImgList ? item.CarImgList.SS! : [],
          hasMortgage: item.HasMortgage.BOOL!,
          hasSeizure: item.HasSeizure.BOOL!,
          title: item.Title.S!,
          fuelType: item.FuelType.S!,
          carNumber: item.CarNumber.S!,
          registerNumber: item.RegisterNumber.S!,
          presentationNumber: item.PresentationNumber.S!,
          price: Number.parseInt(item.Price.N!),
          hasAccident: item.HasAccident.S!,
          gearBox: item.GearBox.S!,
          color: item.Color.S!,
          company: item.Company.S!,
          category: item.Category.S!,
        }
      })
    }

    private async getUnregisteredCars() {
    // [A, B]
    const [rawCars, rawuploadedCars] = await Promise.all([
      this.dynamoCarClient.segmentScanCar(8),
      this.dynamoUploadedCarClient.segmentScanUploadedCar(8, ["PK", "SK"])
    ])
    console.log("rawCars: ", rawCars.length)
    console.log("rawuploadedCars: ", rawuploadedCars.length)

    const carMap = new Map<string, string>(rawCars.map(car=>[car.PK.S!, car.PK.S!]))
    const uploadedCarMap = new Map<string, string>(rawuploadedCars.map(car=>[car.SK.S!, car.PK.S!]))

    // A - B: 등록이 될 대상
    const unregisteredRawCars = rawCars.filter(car=>!uploadedCarMap.get(car.PK.S!))
    // B - A: 삭제가 될 대상.
    const uploadedCarShouldBeDeleted = rawuploadedCars.filter(item=>!carMap.get(item.SK.S!))

    if (uploadedCarShouldBeDeleted.length) {
      // Delete
      console.log(uploadedCarShouldBeDeleted);
      const deleteResults = await this.dynamoUploadedCarClient.rawBatchDelete(uploadedCarShouldBeDeleted)
      console.log("Delete result: ");
      console.log(deleteResults);
    }

    // Convert to CarObject and return
    return CarAssignService.createCarObject(unregisteredRawCars)
  }

  // private async getUnregisteredCarMap() {
  //   const cars = await this.getUnregisteredCars()
  //   return new Map<string, CarDataObject>(cars.map(car=>[car.carNumber, car]))
  // }

  async getAccountMap() {
    if (!this._accountMap) {
      const allUsers = await this.sheetClient.getAccounts()
      this._accountMap = new Map<string, Account>(allUsers.map(user=>[user.id, user]))
    }
    return this._accountMap!
  }


  async assign() {
    const [unregisteredCars, { segmentMap, companyMap }, allUserMap] = await Promise.all([
      this.getUnregisteredCars(),
      this.categoryInitializer.initializeMaps(),
      this.getAccountMap(),
    ])

    const carClassifier = new CarClassifier(unregisteredCars, segmentMap, companyMap)
    let classifiedCarNums = carClassifier.classifyAll().map(source=>source.car.carNumber.toString())

    const userIds = Array.from(allUserMap.keys())

    for (const id of userIds) {
      console.log(id);
      const amountCanAssign = classifiedCarNums.length
      if (!amountCanAssign) {
        console.log("No more cars to assign.");
        break
      }

      const result = await this.dynamoUploadedCarClient.queryById(id)
      if (result.$metadata.httpStatusCode !== 200) {
        console.error(result);
        throw new Error("Response is not 200");
      }
      const itemsAmount = result.Items!.length
      const amountToAssign = CarAssignService.MAX_COUNT - itemsAmount

      if (amountToAssign <= 0) {
        console.log(`Account ${id} is fully assigned.`);
        continue
      }

      const spliceStartIndex = amountToAssign < amountCanAssign ? amountCanAssign-amountToAssign : 0
      const splicedCars = classifiedCarNums.splice(spliceStartIndex)
      const responses = await this.dynamoUploadedCarClient.batchSave(id, splicedCars, false)
      console.log("Save result: ");
      console.log(responses);

    }
  }
}
