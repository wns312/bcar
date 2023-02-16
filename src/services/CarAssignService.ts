import { SheetClient, DynamoCarClient, DynamoUploadedCarClient } from "../db"
import { Account, Car, UploadedCar } from "../entities"
import { Company, Origin, Segment, UploadSource } from "../types"
import { CarClassifier, CategoryInitializer, chunk } from "../utils"

export class CarAssignService {

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

  private filterSources(classifiedSources: UploadSource[]) {
    // 1. 수입차 200대
    const importedSources = classifiedSources
      .filter(source=>source.origin === Origin.Imported)

    // 2. 화물/특장 총 500대 (포터 봉고 300대, 대형화물 200대)
    const domesticSources = classifiedSources.filter(source=>source.origin === Origin.Domestic)
    const hksCars = domesticSources.filter(source=>
      source.company.name === '현대'
      || source.company.name === '기아'
      || source.company.name === '삼성'
    )

    // 2-1. 봉고포터
    const bongoPorterSources = hksCars.filter(source=>
      source.car.title.includes('봉고')
      || source.car.title.includes('포터')
    )
    const bongoPorterSourceMap = new Map<string, UploadSource>(
      bongoPorterSources.map(source=>[source.car.carNumber, source])
    )

    // 2-2. 대형화물
    const bigTonCars = domesticSources.filter(source=>
      source.car.title.includes('톤')
      && !source.car.title.includes('1톤')
      && !source.car.title.includes('1.2톤')
      && !source.car.title.includes('1.4톤')
    )
    const hyundaiCars = hksCars.filter(source=>
      source.car.title.includes('덤프')
      || source.car.title.includes('마이티')
      || source.car.title.includes('메가트럭')
      || source.car.title.includes('에어로')
      || source.car.title.includes('카운티')
    )
    const kiaCars = hksCars.filter(source=>
      source.car.title.includes('그랜버드')
      || source.car.title.includes('라이노')
      || source.car.title.includes('복사')
      || source.car.title.includes('봉고화물')
      || source.car.title.includes('세레스')
      || source.car.title.includes('콤보')
      || source.car.title.includes('타이탄')
      || source.car.title.includes('트레이드')
      || source.car.title.includes('파맥스')
    )

    const samsungCars = hksCars.filter(source=>source.car.title.includes('르노마스터'))
    // 봉고(포터)덤프(현대, 기아)의 경우 Big에도 걸리고, 봉고포터에도 걸리므로 봉고 포터에 포함하고
    // largeTruckSources에서만 제거해준다.
    const largeTruckSources = Array.from(
      [...bigTonCars, ...hyundaiCars, ...kiaCars, ...samsungCars].reduce(
        (map, source)=>map.set(source.car.carNumber, source),
        new Map<string, UploadSource>()
      ).values()
    ).filter(source=>!bongoPorterSourceMap.get(source.car.carNumber))

    // 봉고와 해당 차량을 제거한 domesticCarMap
    const domesticCarMap = new Map<string, UploadSource>(
      domesticSources.map(source=>[source.car.carNumber, source])
    )
    largeTruckSources.forEach(source => { domesticCarMap.delete(source.car.carNumber) })
    bongoPorterSources.forEach(source => { domesticCarMap.delete(source.car.carNumber) })

    return {
      importedSources,
      bongoPorterSources,
      largeTruckSources,
      domesticSources: Array.from(domesticCarMap.values())
    }
  }

  private async getAccountSources(
    accountCarNumbers: string[], segmentMap: Map<string, Segment>, companyMap: Map<string, Company>
  ) {
    if (!accountCarNumbers.length) return []

    const accountCars = await this.dynamoCarClient.QueryCarsByCarNumbers(accountCarNumbers)
    return new CarClassifier(accountCars, segmentMap, companyMap).classifyAll()
  }

  async releaseCars(accounts: Account[], segmentMap: Map<string, Segment>, companyMap: Map<string, Company>) {
    for (const account of accounts) {
      const {id, bongoPorterAmount, importedAmount, largeTruckAmount, domesticAmount} = account
      console.log(id, bongoPorterAmount, importedAmount, largeTruckAmount, domesticAmount)

      const accountUploadedCars = await this.dynamoUploadedCarClient.queryById(id)
      const accountCarNumbers = accountUploadedCars.map(car=>car.carNumber)
      if (!accountCarNumbers.length) {
        console.log("No uploaded cars")
        console.log("=============================================================")
        continue
      }
      const accountCars = await this.dynamoCarClient.QueryCarsByCarNumbers(accountCarNumbers)
      const acccountSources = new CarClassifier(accountCars, segmentMap, companyMap).classifyAll()

      const {
        bongoPorterSources: accountBongoPorterSources,
        importedSources: accountImportedSources,
        largeTruckSources: accountLargeTruckSources,
        domesticSources: accountDomesticSources,
      } = this.filterSources(acccountSources)

      const splicedAccountImportedSources = accountImportedSources.splice(0, importedAmount)
      const splicedAccountBongoPorterSources = accountBongoPorterSources.splice(0, bongoPorterAmount)
      const splicedAccountLargeTruckSources = accountLargeTruckSources.splice(0, largeTruckAmount)
      const splicedAccountDomesticSources = accountDomesticSources.splice(0, domesticAmount)

      console.log(
        "남을 애들: ",
        splicedAccountBongoPorterSources.length,
        splicedAccountImportedSources.length,
        splicedAccountLargeTruckSources.length,
        splicedAccountDomesticSources.length,
      )
      console.log(
        "삭제 될 애들: ",
        accountBongoPorterSources.length,
        accountImportedSources.length,
        accountLargeTruckSources.length,
        accountDomesticSources.length,
      )
      console.log("=============================================================")

      const deleteTargetCarNumbers = accountBongoPorterSources
        .concat(accountImportedSources)
        .concat(accountLargeTruckSources)
        .concat(accountDomesticSources)
        .map(source=>source.car.carNumber)
      if (!deleteTargetCarNumbers.length) continue
      console.log("업로드 차량 삭제 진행")
      const responses = await this.dynamoUploadedCarClient.batchDeleteCarsByCarNumbers(deleteTargetCarNumbers)
      responses.forEach(r => {
        if (r.$metadata.httpStatusCode !== 200) {
          console.error(r)
          throw new Error("업로드 차량 삭제 실패")
        }
      })
    }
    console.log("할당 초과량 삭제 완료")
  }

  async assignCars(accounts: Account[], segmentMap: Map<string, Segment>, companyMap: Map<string, Company>) {
    const unregisteredCars = await this.getUnregisteredCars()
    const unregisteredSources = new CarClassifier(unregisteredCars, segmentMap, companyMap).classifyAll()
    const {
      bongoPorterSources,
      importedSources,
      largeTruckSources,
      domesticSources,
    } = this.filterSources(unregisteredSources)

    for (const {id, totalAmount, bongoPorterAmount, importedAmount, largeTruckAmount, domesticAmount} of accounts) {
      const accountUploadedCars = await this.dynamoUploadedCarClient.queryById(id)
      const accountCarNumbers = accountUploadedCars.map(car=>car.carNumber)
      const acccountSources = await this.getAccountSources(accountCarNumbers, segmentMap, companyMap)

      const {
        bongoPorterSources: accountBongoPorterSources,
        importedSources: accountImportedSources,
        largeTruckSources: accountLargeTruckSources,
        domesticSources: accountDomesticSources,
      } = this.filterSources(acccountSources)

      const assignableBongoPorterAmount = bongoPorterAmount - accountBongoPorterSources.length
      const assignableimportedAmount = importedAmount - accountImportedSources.length
      const assignablelargeTruckAmount = largeTruckAmount - accountLargeTruckSources.length
      const assignableDomesticCarAmount = domesticAmount - accountDomesticSources.length

      console.log(
        bongoPorterSources.length,
        importedSources.length,
        largeTruckSources.length,
        domesticSources.length,
      )
      console.log(id, bongoPorterAmount, importedAmount, largeTruckAmount, domesticAmount)
      console.log(
        "할당된 양: ",
        accountBongoPorterSources.length,
        accountImportedSources.length,
        accountLargeTruckSources.length,
        accountDomesticSources.length,
      )
      console.log(
        "할당될 양: ",
        assignableBongoPorterAmount,
        assignableimportedAmount,
        assignablelargeTruckAmount,
        assignableDomesticCarAmount
      )

      const splicedSpecialSources = importedSources.splice(0, importedAmount - accountImportedSources.length)
        .concat(largeTruckSources.splice(0, largeTruckAmount - accountLargeTruckSources.length))
        .concat(bongoPorterSources.splice(0, bongoPorterAmount - accountBongoPorterSources.length))

      const splicedDomesticSources = domesticSources.splice(
        0,
        assignableBongoPorterAmount
        + assignableimportedAmount
        + assignablelargeTruckAmount
        + assignableDomesticCarAmount
        - splicedSpecialSources.length
      )
      const assignCarNumbers = splicedSpecialSources
        .concat(splicedDomesticSources)
        .map(source=>source.car.carNumber)
      console.log("할당될 특이 소스: ", splicedSpecialSources.length)
      console.log("할당될 일반 소스: ", splicedDomesticSources.length)
      console.log("할당될 총 소스: ", splicedSpecialSources.length + splicedDomesticSources.length)
      console.log("할당된 뒤의 총 소스: ", acccountSources.length + assignCarNumbers.length)
      console.log("=====================================")
      if (totalAmount !== acccountSources.length + assignCarNumbers.length) {
        throw new Error("Assign Amount Error")
      }
      if (!assignCarNumbers.length) continue

      const responses = await this.dynamoUploadedCarClient.batchSaveByCarNumbers(id, assignCarNumbers, false)
      responses.forEach(response=> {
        if (response.$metadata.httpStatusCode !== 200) {
          console.log(response)
        }
      })

    }
    console.log("할당 완료")
  }

  async assignAll() {
    const [accountIdMap, { segmentMap, companyMap }] = await Promise.all([
      this.sheetClient.getAccountIdMap(),
      this.categoryInitializer.initializeMaps(),
    ])
    const accounts = Array.from(accountIdMap.values())

    await this.releaseCars(accounts, segmentMap, companyMap)
    await this.assignCars(accounts, segmentMap, companyMap)
  }
}
