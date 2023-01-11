import { DynamoBaseClient } from "./DynamoBaseClient"
import { UploadSource } from "../../types"

export class DynamoUploadedCarClient {
  baseClient: DynamoBaseClient;
  tableName: string;
  indexName: string;

  static userPrefix = "#USER-"
  static carPrefix = "#CAR-"

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
  private async segmentScan(PK: string, SK: string, segmentSize: number) {
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


  async scanUploadedCar() {
    return this.scan(DynamoUploadedCarClient.userPrefix, DynamoUploadedCarClient.carPrefix)
  }

  async segmentScanUploadedCar(segmentSize: number) {
    return this.segmentScan(
      DynamoUploadedCarClient.userPrefix,
      DynamoUploadedCarClient.carPrefix,
      segmentSize
    )
  }

  batchSave(id: string, updatedSources: UploadSource[]) {
    const now = Date.now()
    const putItems = updatedSources.map(({car: {carNumber}})=>({
      Item: {
        PK: { S: DynamoUploadedCarClient.userPrefix + id },
        SK: { S: DynamoUploadedCarClient.carPrefix + carNumber },
        registeredAt: { N: now.toString() },
      }
    }))
    return this.baseClient.batchPutItems(this.tableName, ...putItems)
  }

  batchDelete(id: string, carNums: string[]) {
    const deleteRequestInput = carNums.map(carNumber => ({
      Key: {
        PK: { S: DynamoUploadedCarClient.userPrefix + id },
        SK: { S: DynamoUploadedCarClient.carPrefix + carNumber },
      }
    }))
    return this.baseClient.batchDeleteItems(this.tableName, ...deleteRequestInput)
  }
}
