import { DynamoBaseClient } from "./DynamoBaseClient"
import { CategoryFormatter } from "./formatters"
import { CarManufacturer, CarSegment } from "../../types"

export class DynamoCategoryClient {
  baseClient: DynamoBaseClient;
  tableName: string;
  indexName: string;

  static segmentPrefix = "#SEGMENT-"
  static companyPrefix = "#COMPANY-"
  static modelPrefix = "#MODEL-"
  static detailModelPrefix = "#DETAIL-"

  constructor(region: string, tableName: string, indexName: string) {
    this.baseClient = new DynamoBaseClient(region);
    this.tableName = tableName;
    this.indexName = indexName;
  }

  private async scan(PK: string, SK: string) {
    const result = await this.baseClient.scanItems({
      TableName: this.tableName,
      FilterExpression: `begins_with(PK, :p) and begins_with(SK, :s)`,
      ExpressionAttributeValues: {
        ":p": { S: PK },
        ":s": { S: SK },
      }
    })
    return result.Items!
  }

  async segmentScan(PK: string, SK: string, segmentSize: number) {
    const resultsListPromise = []
    for (let i = 0; i < segmentSize; i++) {
      const results = this.baseClient.segmentScan({
        TableName: this.tableName,
        FilterExpression: "begins_with(SK, :s) and begins_with(PK, :p)",
        ExpressionAttributeValues: {
          ":p": { S: PK },
          ":s": { S: SK },
        },
        Segment: i,
        TotalSegments: segmentSize,
      })
      resultsListPromise.push(results)
    }
    const resultsList = await Promise.all(resultsListPromise)
    return resultsList.flat()
  }

  scanSegment() {
    return this.scan(DynamoCategoryClient.segmentPrefix, DynamoCategoryClient.segmentPrefix)
  }

  scanCompany() {
    return this.scan(DynamoCategoryClient.companyPrefix, DynamoCategoryClient.companyPrefix)
  }

  scanModel() {
    return this.scan(DynamoCategoryClient.modelPrefix, DynamoCategoryClient.companyPrefix)
  }

  scanDetailModel(segmentSize: number) {
    return this.segmentScan(
      DynamoCategoryClient.detailModelPrefix,
      DynamoCategoryClient.modelPrefix,
      segmentSize
    )
  }

  // 1. Segment 저장: PK, SK 지정한 객체를 Item이라는 객체로 감쌈
  saveSegments(segmentMap: Map<string, CarSegment>) {
    const putItems = CategoryFormatter.createSegmentForm(segmentMap)
    return this.baseClient.batchPutItems(this.tableName, ...putItems)
  }

  saveCompanies(carManufacturerMap: Map<string, CarManufacturer>) {
    const putItems = CategoryFormatter.createManufacturerForm(carManufacturerMap)
    return this.baseClient.batchPutItems(this.tableName, ...putItems)
  }

  saveModels(companyMap: Map<string, CarManufacturer>) {
    const putItems = CategoryFormatter.createCarModelForm(companyMap)
    return this.baseClient.batchPutItems(this.tableName, ...putItems)
  }

  saveDetailModels(companyMap: Map<string, CarManufacturer>) {
    const putItems = CategoryFormatter.createCarDetailModelForm(companyMap)
    return this.baseClient.batchPutItems(this.tableName, ...putItems)
  }
}

  // private async scanWithFilter(PK: string, SK: string, filter: Filter) {
  //   const result = await this.baseClient.scanItems({
  //     TableName: this.tableName,
  //     FilterExpression: `begins_with(SK, :s) and begins_with(PK, :p) and ${filter.key} = :${filter.key}`,
  //     ExpressionAttributeValues: {
  //       ":p": { S: PK },
  //       ":s": { S: SK || PK },
  //       [`:${filter.key}`]: { S: filter.value },
  //     }
  //   })
  //   return result.Items!
  // }

  // scanDetailModelByCompany(company: string) {
  //   return this.scanWithFilter(
  //     DynamoCategoryClient.detailModelPrefix,
  //     DynamoCategoryClient.modelPrefix,
  //     {
  //       key: "company",
  //       value: company
  //     },
  //   )
  // }
