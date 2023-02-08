import { AttributeValue } from "@aws-sdk/client-dynamodb"
import { DynamoCategoryClient } from "../db"
import { Car } from "../entities"
import { DetailModel, Model, Segment, Company, Origin } from "../types"

export class CategoryInitializer {
  constructor(private dynamoCategoryClient: DynamoCategoryClient) {}

  static createCarObject(items: Record<string, AttributeValue>[]): Car[] {
    return items.map(item=>{
      return new Car({
        carCheckSrc: item.carCheckSrc.S!,
        modelYear: item.modelYear.S!,
        presentationsDate: item.presentationsDate.S!,
        displacement: parseInt(item.displacement.N!),
        mileage: parseInt(item.mileage.N!),
        images: item.images ? item.images.SS! : [],
        hasMortgage: item.hasMortgage.BOOL!,
        hasSeizure: item.hasSeizure.BOOL!,
        title: item.title.S!,
        fuelType: item.fuelType.S!,
        carNumber: item.carNumber.S!,
        registerNumber: item.registerNumber.S!,
        presentationNumber: item.presentationNumber.S!,
        price: parseInt(item.price.N!),
        hasAccident: item.hasAccident.S!,
        gearBox: item.gearBox.S!,
        color: item.color.S!,
        company: item.company.S!,
        category: item.category.S!,
      })
    })
  }

  private createSegmentMap(items: Record<string, AttributeValue>[]): Map<string, Segment> {
    const segmentMap = new Map<string, Segment>()
    items.reduce((map, item)=>{
      return map.set(item.name.S!, {
        name: item.name.S!,
        value: item.value.S!,
        index: Number.parseInt(item.index.N!),
      })
    }, segmentMap)
    return segmentMap
  }

  private createCompanyMap(items: Record<string, AttributeValue>[]): Map<string, Company> {
    const manufacturerMap = new Map<string, Company>()
    items.reduce((map, item)=>{
      return map.set(item.name.S!, {
        origin: item.origin.S! === "DOMESTIC" ? Origin.Domestic : Origin.Imported,
        name: item.name.S!,
        dataValue: item.value.S!,
        index: Number.parseInt(item.index.N!),
        carModelMap: new Map<string, Model>()
      })
    }, manufacturerMap)
    return manufacturerMap
  }

  private fillCarModelMap(
    companyMap: Map<string, Company>, items: Record<string, AttributeValue>[]
  ): Map<string, Company> {

    items.reduce((map, item)=>{
      const carManufacturer = map.get(item.company.S!)
      if (!carManufacturer) {
        console.log(item.company.S!);
        throw new Error("There is no proper carModelMap")
      }
      const detailModels: DetailModel[] = []
      let carModelName = item.name.S!
      carModelName = carModelName === "봉고화물" ? "봉고" : carModelName
      carModelName = carModelName === "e-마이티" ? "마이티" : carModelName
      carModelName = carModelName === "캡처" ? "캡쳐" : carModelName
      carManufacturer.carModelMap.set(carModelName, {
        carSegment: item.segment.S!,
        name: item.name.S!,
        dataValue: item.value.S!,
        index: Number.parseInt(item.index.N!),
        detailModels
      })
      return map
    }, companyMap)
    return companyMap
  }

  private fillCarDetails(
    companyMap: Map<string, Company>, items: Record<string, AttributeValue>[]
  ): Map<string, Company> {

    items.reduce((map, item)=>{
      const carManufacturer = map.get(item.company.S!)
      if (!carManufacturer) {
        console.log(item.company.S!);
        throw new Error("There is no proper carModelMap")
      }

      let carModelName = item.SK.S!.replace("#MODEL-", "")
      carModelName = carModelName === "봉고화물" ? "봉고" : carModelName
      carModelName = carModelName === "e-마이티" ? "마이티" : carModelName
      carModelName = carModelName === "캡처" ? "캡쳐" : carModelName
      const carModel = carManufacturer.carModelMap.get(carModelName)
      if (!carModel) {
        console.log(carModelName);
        throw new Error("There is no proper carModel")
      }

      carModel.detailModels!.push({
        name: item.name.S!,
        dataValue: item.value.S!,
        index: Number.parseInt(item.index.N!),
      })
      return map
    }, companyMap)
    // index 순서로 detail 재정렬

    companyMap.forEach(company=>{
      company.carModelMap.forEach(model=>{
        model.detailModels = model.detailModels!.sort((a, b)=>{
          return a.index - b.index
        })
      })
    })
    return companyMap
  }

  async initializeMaps() {
    const [segmentResult, companyResult, carModelResult, carDetailResult] = await Promise.all([
      this.dynamoCategoryClient.scanSegment(),
      this.dynamoCategoryClient.scanCompany(),
      this.dynamoCategoryClient.scanModel(),
      this.dynamoCategoryClient.scanDetailModel(2),
    ])
    console.log("segmentResult: ", segmentResult.length)
    console.log("companyResult: ", companyResult.length)
    console.log("carModelResult: ", carModelResult.length)
    console.log("carDetailResult: ", carDetailResult.length)

    const segmentMap = this.createSegmentMap(segmentResult)
    const companyMap = this.createCompanyMap(companyResult)

    this.fillCarModelMap(companyMap, carModelResult)
    this.fillCarDetails(companyMap, carDetailResult)
    return {
      segmentMap,
      companyMap
    }
  }
}

