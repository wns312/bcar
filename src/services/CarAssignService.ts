import { DynamoCarClient, DynamoUploadedCarClient } from "../db"
import { Account, Car, UploadedCar } from "../entities"
import { Company, Origin, Segment, SourceBundle, UploadSource } from "../types"
import { CarClassifier } from "../utils"

export class CarAssignService {
  constructor(
    private dynamoCarClient: DynamoCarClient,
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
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
      console.log(uploadedCarShouldBeDeleted.map(car => car.carNumber))
      const deleteResponses = await this.dynamoUploadedCarClient.batchDelete(uploadedCarShouldBeDeleted)
      console.log("Delete result: ")
      deleteResponses.forEach(r => {
        if (r.$metadata.httpStatusCode !== 200) {
          console.log(r)
        }
      })
    }

    // Convert to CarObject and return
    return unregisteredCars
  }

  private categorizeSourcesByPrice(classifiedSources: UploadSource[]) {
    const [under2000, more2000] = classifiedSources.reduce((list, source)=> {
      source.car.price < 2000 ? list[0].push(source) : list[1].push(source)
      return list
    }, [[], []] as [UploadSource[], UploadSource[]])
    return {
      under2000,
      more2000,
    }
  }

  private categorizeSourcesByKind(classifiedSources: UploadSource[]) {
    const bongoPorterRegex = /봉고|포터/
    const bigCarsRegex = /톤|1톤|1.2톤|1.4톤|덤프|마이티|메가트럭|에어로|카운티|그랜버드|라이노|복사|봉고화물|세레스|콤보|타이탄|트레이드|파맥스|르노마스터/
    const [importedSources, bongoPorterSources, largeTruckSources, domesticSources] = classifiedSources.reduce((list, source)=> {
      if (source.origin === Origin.Imported) {
        list[0].push(source)
      } else {
        if (bongoPorterRegex.test(source.car.title)) {
          list[1].push(source)
        } else if (bigCarsRegex.test(source.car.title)) {
          list[2].push(source)
        } else {
          list[3].push(source)
        }
      }
      return list
    }, [[], [], [], []] as [UploadSource[], UploadSource[], UploadSource[], UploadSource[]])

    return { importedSources, bongoPorterSources, largeTruckSources, domesticSources }
  }

  private calculateAssignCars(
    account: Account,
    acccountSources: UploadSource[],
    allSourceBundle: SourceBundle,
  ) {
    const {bongoPorterSources, importedSources, largeTruckSources, domesticSources} = allSourceBundle
    // 추가될 양 계산을 위해 카테고리화 하는것
    const {
      bongoPorterSources: ABPSources,
      importedSources: AISources,
      largeTruckSources: ALTSources,
      domesticSources: ADSources,
    } = this.categorizeSourcesByKind(acccountSources)

    // 추가될 양을 계산하는 것.
    const bongoPorterAddAmount = account.bongoPorterAmount - ABPSources.length
    const importedAddAmount = account.importedAmount - AISources.length
    const largeTruckAddAmount = account.largeTruckAmount - ALTSources.length
    const domesticAddAmount = account.domesticAmount - ADSources.length

    const totalAssignedAmount = ABPSources.length + AISources.length + ALTSources.length + ADSources.length
    const totalAddAmount = bongoPorterAddAmount + importedAddAmount + largeTruckAddAmount + domesticAddAmount

    console.log(
      bongoPorterSources.length,
      importedSources.length,
      largeTruckSources.length,
      domesticSources.length,
    )
    console.log("할당된 양: ", totalAssignedAmount)
    console.log("할당될 양: ", totalAddAmount)

    // 계산 후 할당 할 양을 잘라낸다.
    // 수입차, 화물, 봉고포터
    const splicedSpecialSources = importedSources.splice(0, account.importedAmount - AISources.length)
      .concat(largeTruckSources.splice(0, account.largeTruckAmount - ALTSources.length))
      .concat(bongoPorterSources.splice(0, account.bongoPorterAmount - ABPSources.length))
      .concat(bongoPorterSources.splice(0, account.bongoPorterAmount - ABPSources.length))

      // 일반국내차량 계산 후 할당될 일반차량과 특수차량을 합침
    return domesticSources
      .splice(0, totalAddAmount - splicedSpecialSources.length)
      .concat(splicedSpecialSources)
      .map(source=>source.car.carNumber)
  }

  async releaseExceededCars(accounts: Account[], segmentMap: Map<string, Segment>, companyMap: Map<string, Company>) {
    for (const account of accounts) {
      // 차량 할당 개수
      const accountUploadedCars = await this.dynamoUploadedCarClient.queryById(account.id)
      const accountCarNumbers = accountUploadedCars.map(car=>car.carNumber)
      if (!accountCarNumbers.length) continue

      const accountCars = await this.dynamoCarClient.queryCarsByCarNumbers(accountCarNumbers)
      const acccountSources = new CarClassifier(accountCars, segmentMap, companyMap).classifyAll()
      const { bongoPorterSources, importedSources, largeTruckSources, domesticSources } = this.categorizeSourcesByKind(acccountSources)

      importedSources.splice(0, account.importedAmount)
      bongoPorterSources.splice(0, account.bongoPorterAmount)
      largeTruckSources.splice(0, account.largeTruckAmount)
      domesticSources.splice(0, account.domesticAmount)

      const carNumbersShouldDelete = bongoPorterSources
        .concat(importedSources)
        .concat(largeTruckSources)
        .concat(domesticSources)
        .map(source=>source.car.carNumber)
      if (!carNumbersShouldDelete.length) continue

      const responses = await this.dynamoUploadedCarClient.batchDeleteCarsByCarNumbers(carNumbersShouldDelete)
      responses.forEach(r => {
        if (r.$metadata.httpStatusCode !== 200) {
          console.error(r)
          throw new Error("업로드 차량 삭제 실패")
        }
      })
    }
  }

  async assignCars(accounts: Account[], segmentMap: Map<string, Segment>, companyMap: Map<string, Company>) {
    const unregisteredCars = await this.getUnregisteredCars()
    const unregisteredSources = new CarClassifier(unregisteredCars, segmentMap, companyMap).classifyAll()
    const sourceBundle = this.categorizeSourcesByKind(unregisteredSources)

    for (const account of accounts) {
      const accountUploadedCars = await this.dynamoUploadedCarClient.queryById(account.id)
      const accountCars = await this.dynamoCarClient.queryCarsByCarNumbers(accountUploadedCars.map(car=>car.carNumber))
      const acccountSources = new CarClassifier(accountCars, segmentMap, companyMap).classifyAll()
      const carNumbersShouldAssigned = this.calculateAssignCars(account, acccountSources, sourceBundle)

      console.log("할당될 총 소스: ", carNumbersShouldAssigned.length)
      console.log("할당된 뒤의 총 소스: ", acccountSources.length + carNumbersShouldAssigned.length)
      console.log("=====================================")
      if (account.totalAmount !== acccountSources.length + carNumbersShouldAssigned.length) throw new Error("Assign Amount Error")
      if (!carNumbersShouldAssigned.length) continue

      const responses = await this.dynamoUploadedCarClient.batchSaveByCarNumbers(account.id, carNumbersShouldAssigned, false)
      responses.forEach(response=> {
        if (response.$metadata.httpStatusCode !== 200) {
          console.log(response)
        }
      })
    }
    console.log("할당 완료")
  }
}
