import { DynamoCarClient, SheetClient } from "../db"
import { Account, Car } from "../entities"
import { Company, Origin, Segment, SourceBundle, UploadSource } from "../types"
import { CarClassifier } from "../utils"

export class CarAssignService {

  private static bongoPorterRegex = /봉고|포터/
  private static bigCarsRegex = /톤|1톤|1.2톤|1.4톤|덤프|마이티|메가트럭|에어로|카운티|그랜버드|라이노|복사|봉고화물|세레스|콤보|타이탄|트레이드|파맥스|르노마스터/

  constructor(private dynamoCarClient: DynamoCarClient, private sheetClient: SheetClient) {}

  static categorizeCarsByAccountId(assignedCars: Car[]) {
    const carMap = new Map<string, Car[]>()
    assignedCars.reduce((map, item)=>{
      if (!item.uploader) return map
      if (map.get(item.uploader) === undefined) {
        map.set(item.uploader, [])
      }
      map.get(item.uploader)!.push(item)
      return map
    }, carMap)
    return carMap
  }

  private static categorizeSourcesByKind(classifiedSources: UploadSource[]) {
    const [importedSources, bongoPorterSources, largeTruckSources, domesticSourcesUnder1000, domesticSourcesUnder2500] = classifiedSources.reduce((list, source)=> {
      if (source.origin === Origin.Imported) {
        list[0].push(source)
      } else {
        if (CarAssignService.bongoPorterRegex.test(source.car.title)) {
          list[1].push(source)
        } else if (CarAssignService.bigCarsRegex.test(source.car.title)) {
          list[2].push(source)
        } else {
          if (source.car.price < 1000) {
            list[3].push(source)
          } else {
            list[4].push(source)
          }
        }
      }
      return list
    }, [[], [], [], [], []] as [UploadSource[], UploadSource[], UploadSource[], UploadSource[], UploadSource[]])

    return { importedSources, bongoPorterSources, largeTruckSources, domesticSourcesUnder1000, domesticSourcesUnder2500 }
  }

  private static calculateAssignCars(account: Account, acccountSources: UploadSource[], allSourceBundle: SourceBundle) {
    const {bongoPorterSources, importedSources, largeTruckSources, domesticSourcesUnder1000, domesticSourcesUnder2500} = allSourceBundle
    // 추가될 양 계산을 위해 카테고리화 하는것
    const {
      bongoPorterSources: ABPSources,
      importedSources: AISources,
      largeTruckSources: ALTSources,
      domesticSourcesUnder1000: ADSourcesUnder1000,
      domesticSourcesUnder2500: ADSourcesUnder2500,
    } = CarAssignService.categorizeSourcesByKind(acccountSources)

    // 추가될 양을 계산하는 것.
    const importedAddAmount = account.importedAmount - AISources.length
    const bongoPorterAddAmount = account.bongoPorterAmount - ABPSources.length
    const largeTruckAddAmount = account.largeTruckAmount - ALTSources.length
    const domesticAddAmountUnder1000 = account.domesticAmountUnder1000 - ADSourcesUnder1000.length
    const domesticAddAmountUnder2500 = account.domesticAmountUnder2500 - ADSourcesUnder2500.length

    const totalAssignedAmount = ABPSources.length + AISources.length + ALTSources.length + ADSourcesUnder1000.length + ADSourcesUnder2500.length
    const totalAddAmount = bongoPorterAddAmount + importedAddAmount + largeTruckAddAmount + domesticAddAmountUnder1000 + domesticAddAmountUnder2500

    console.log(bongoPorterSources.length, importedSources.length, largeTruckSources.length, domesticSourcesUnder1000.length, domesticSourcesUnder2500.length)
    console.log("할당된 양: ", totalAssignedAmount)
    console.log("할당될 양: ", totalAddAmount)

    // 계산 후 할당 할 양을 잘라낸다.
    // 수입차, 화물, 봉고포터
    const splicedSpecialSources = importedSources.splice(0, importedAddAmount).concat(largeTruckSources.splice(0, largeTruckAddAmount)).concat(bongoPorterSources.splice(0, bongoPorterAddAmount))
    const splicedDomesticSources = domesticSourcesUnder1000.splice(0, domesticAddAmountUnder1000).concat(domesticSourcesUnder2500.splice(0, domesticAddAmountUnder2500))
    // 일반국내차량 계산 후 할당될 일반차량과 특수차량을 합침
    return splicedDomesticSources
      .concat(splicedSpecialSources)
      .splice(0, totalAddAmount)
      .map(source=>source.car)
  }

  private async filterCars(cars: Car[]) {
    const {
      carNumberFilterSet,
      agentFilterSet,
      sellerPhoneFilterSet,
    } = await this.sheetClient.getFilters()
    const [filteredCars, nonFilteredCars] = cars.reduce(([f, n], car) => {
      const {carNumber, agency, sellerPhone} = car
      if (
        carNumberFilterSet.has(carNumber)
        || agentFilterSet.has(agency)
        || sellerPhoneFilterSet.has(sellerPhone)
      ) {
        f = [...f, car]
      } else {
        n = [...n, car]
      }
      return [f, n]
    }, [[], []] as Car[][])
    return {
      filteredCars,
      nonFilteredCars,
    }
  }

  private spliceSources(account: Account, accountSources: UploadSource[]) {
    const { bongoPorterSources, importedSources, largeTruckSources, domesticSourcesUnder1000, domesticSourcesUnder2500 } = CarAssignService.categorizeSourcesByKind(accountSources)
    importedSources.splice(0, account.importedAmount)
    largeTruckSources.splice(0, account.largeTruckAmount)
    bongoPorterSources.splice(0, account.bongoPorterAmount)
    domesticSourcesUnder1000.splice(0, account.domesticAmountUnder1000)
    domesticSourcesUnder2500.splice(0, account.domesticAmountUnder2500)
    const domesticSources = domesticSourcesUnder1000.concat(domesticSourcesUnder2500)
    return domesticSources.concat(largeTruckSources).concat(bongoPorterSources).concat(importedSources)
  }


  async assignCars(accounts: Account[], segmentMap: Map<string, Segment>, companyMap: Map<string, Company>) {
    const cars = await this.dynamoCarClient.queryCars()
    const carMap = CarAssignService.categorizeCarsByAccountId(cars)
    const { nonFilteredCars: unregisteredCars } = await this.filterCars(carMap.get("null")!)
    const unregisteredSources = new CarClassifier(unregisteredCars, segmentMap, companyMap).classifyAll()
    const sourceBundle = CarAssignService.categorizeSourcesByKind(unregisteredSources)
    for (const account of accounts) {
      const accountCars = carMap.has(account.id) ? carMap.get(account.id)! : []
      const acccountSources = new CarClassifier(accountCars, segmentMap, companyMap).classifyAll()
      const assignCars = CarAssignService.calculateAssignCars(account, acccountSources, sourceBundle)
      console.log("할당될 총 소스: ", assignCars.length)
      console.log("할당된 뒤의 총 소스: ", acccountSources.length + assignCars.length)
      console.log("=====================================")
      if (account.totalAmount !== acccountSources.length + assignCars.length) {
        throw new Error("Assign Amount Error")
      }
      if (!assignCars.length) continue
      assignCars.forEach((car)=> {
        car.uploader = account.id
      })
      await this.dynamoCarClient.batchSaveCar(assignCars)
    }
    console.log("할당 완료")
  }

  async releaseCars(accounts: Account[], segmentMap: Map<string, Segment>, companyMap: Map<string, Company>) {
    const assignedCars = await this.dynamoCarClient.queryAssignedCars()
    const carMap = CarAssignService.categorizeCarsByAccountId(assignedCars)
    for (const account of accounts) {
      if (!carMap.has(account.id)) continue
      const { filteredCars, nonFilteredCars } = await this.filterCars(carMap.get(account.id)!)
      const acccountSources = new CarClassifier(nonFilteredCars, segmentMap, companyMap).classifyAll()
      const deleteCars = this.spliceSources(account, acccountSources).map(source=>source.car).concat(filteredCars)
      if (deleteCars.length === 0) continue
      deleteCars.forEach(car => {
        car.uploader = "null"
        car.isUploaded = false
      })
      await this.dynamoCarClient.batchSaveCar(deleteCars)
    }
  }
}
