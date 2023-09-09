import { DynamoCarClient } from "../db"
import { Account, Car } from "../entities"
import { Company, Origin, Segment, SourceBundle, UploadSource } from "../types"
import { CarClassifier } from "../utils"

export class CarAssignService {

  private static bongoPorterRegex = /봉고|포터/
  private static bigCarsRegex = /톤|1톤|1.2톤|1.4톤|덤프|마이티|메가트럭|에어로|카운티|그랜버드|라이노|복사|봉고화물|세레스|콤보|타이탄|트레이드|파맥스|르노마스터/

  constructor(private dynamoCarClient: DynamoCarClient) {}

  private static categorizeCarsByAccountId(assignedCars: Car[]) {
    const carMap = new Map<string, Car[]>()
    assignedCars.reduce((map, item)=>{
      if (map.get(item.uploader) === undefined) {
        map.set(item.uploader, [])
      }
      map.get(item.uploader)!.push(item)
      return map
    }, carMap)
    return carMap
  }

  private static categorizeSourcesByKind(classifiedSources: UploadSource[]) {
    const [importedSources, bongoPorterSources, largeTruckSources, domesticSources] = classifiedSources.reduce((list, source)=> {
      if (source.origin === Origin.Imported) {
        list[0].push(source)
      } else {
        if (CarAssignService.bongoPorterRegex.test(source.car.title)) {
          list[1].push(source)
        } else if (CarAssignService.bigCarsRegex.test(source.car.title)) {
          list[2].push(source)
        } else {
          list[3].push(source)
        }
      }
      return list
    }, [[], [], [], []] as [UploadSource[], UploadSource[], UploadSource[], UploadSource[]])

    return { importedSources, bongoPorterSources, largeTruckSources, domesticSources }
  }

  private static calculateAssignCars(account: Account, acccountSources: UploadSource[], allSourceBundle: SourceBundle) {
    const {bongoPorterSources, importedSources, largeTruckSources, domesticSources} = allSourceBundle
    // 추가될 양 계산을 위해 카테고리화 하는것
    const {
      bongoPorterSources: ABPSources,
      importedSources: AISources,
      largeTruckSources: ALTSources,
      domesticSources: ADSources,
    } = CarAssignService.categorizeSourcesByKind(acccountSources)

    // 추가될 양을 계산하는 것.
    const bongoPorterAddAmount = account.bongoPorterAmount - ABPSources.length
    const importedAddAmount = account.importedAmount - AISources.length
    const largeTruckAddAmount = account.largeTruckAmount - ALTSources.length
    const domesticAddAmount = account.domesticAmount - ADSources.length

    const totalAssignedAmount = ABPSources.length + AISources.length + ALTSources.length + ADSources.length
    const totalAddAmount = bongoPorterAddAmount + importedAddAmount + largeTruckAddAmount + domesticAddAmount

    console.log(bongoPorterSources.length, importedSources.length, largeTruckSources.length, domesticSources.length)
    console.log("할당된 양: ", totalAssignedAmount)
    console.log("할당될 양: ", totalAddAmount)

    // 계산 후 할당 할 양을 잘라낸다.
    // 수입차, 화물, 봉고포터
    const splicedSpecialSources = importedSources.splice(0, account.importedAmount - AISources.length)
      .concat(largeTruckSources.splice(0, account.largeTruckAmount - ALTSources.length))
      .concat(bongoPorterSources.splice(0, account.bongoPorterAmount - ABPSources.length))


    // 일반국내차량 계산 후 할당될 일반차량과 특수차량을 합침
    return domesticSources
      .splice(0, totalAddAmount - splicedSpecialSources.length)
      .concat(splicedSpecialSources)
      .splice(0, totalAddAmount)
      .map(source=>source.car)
  }

  async assignCars(accounts: Account[], segmentMap: Map<string, Segment>, companyMap: Map<string, Company>) {
    const unregisteredCars = await this.dynamoCarClient.queryNotAssignedCars()
    const unregisteredSources = new CarClassifier(unregisteredCars, segmentMap, companyMap).classifyAll()
    const sourceBundle = CarAssignService.categorizeSourcesByKind(unregisteredSources)

    for (const account of accounts) {
      const accountCars = await this.dynamoCarClient.queryAssignedCarsByUploader(account.id)
      const acccountSources = new CarClassifier(accountCars, segmentMap, companyMap).classifyAll()
      const assignCars = CarAssignService.calculateAssignCars(account, acccountSources, sourceBundle)
      console.log("할당될 총 소스: ", assignCars.length)
      console.log("할당된 뒤의 총 소스: ", acccountSources.length + assignCars.length)
      console.log("=====================================")
      if (account.totalAmount !== acccountSources.length + assignCars.length) throw new Error("Assign Amount Error")
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
      const accountCars = carMap.get(account.id)
      if (accountCars === undefined) continue
      const acccountSources = new CarClassifier(accountCars, segmentMap, companyMap).classifyAll()
      const { bongoPorterSources, importedSources, largeTruckSources, domesticSources } = CarAssignService.categorizeSourcesByKind(acccountSources)
      importedSources.splice(0, account.importedAmount)
      largeTruckSources.splice(0, account.largeTruckAmount)
      bongoPorterSources.splice(0, account.bongoPorterAmount)
      domesticSources.splice(0, account.domesticAmount)
      const deleteCars = domesticSources.concat(largeTruckSources).concat(bongoPorterSources).concat(importedSources).map(source=>source.car)
      if (deleteCars.length === 0) return
      deleteCars.forEach(car => {
        car.uploader = ""
        car.isUploaded = false
      })
      await this.dynamoCarClient.batchSaveCar(deleteCars)
    }
  }

}
