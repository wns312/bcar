import { AttributeValue } from "@aws-sdk/client-dynamodb"
import { DynamoBaseClient } from "./DynamoBaseClient"

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


  private createScanInput(PK: string, SK: string, segment?: number, segmentSize?: number, projectionExpressions?: string[]) {
    return {
      TableName: this.tableName,
      FilterExpression: "begins_with(SK, :s) and begins_with(PK, :p)",
      ExpressionAttributeValues: {
        ":p": { S: PK },
        ":s": { S: SK },
      },
      ProjectionExpression: projectionExpressions && projectionExpressions.join(", "),
      Segment: segment,
      TotalSegments: segmentSize
    }
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

  private async segmentScan(PK: string, SK: string, segmentSize: number, projectionExpressions?: string[]) {
    const resultsListPromise = []
    for (let i = 0; i < segmentSize; i++) {
      const results = this.baseClient.segmentScan(
        this.createScanInput(PK, SK, i, segmentSize, projectionExpressions)
      )
      resultsListPromise.push(results)
    }
    const resultsList = await Promise.all(resultsListPromise)
    return resultsList.flat()
  }


  async scanUploadedCar() {
    return this.scan(DynamoUploadedCarClient.userPrefix, DynamoUploadedCarClient.carPrefix)
  }

  async segmentScanUploadedCar(segmentSize: number, projectionExpressions?: string[]) {
    return this.segmentScan(
      DynamoUploadedCarClient.userPrefix,
      DynamoUploadedCarClient.carPrefix,
      segmentSize,
      projectionExpressions
    )
  }

  batchSave(id: string, carNums: string[], isUploaded: boolean) {
    const now = Date.now()
    const putItems = carNums.map( carNumber =>({
      Item: {
        PK: { S: DynamoUploadedCarClient.userPrefix + id },
        SK: { S: DynamoUploadedCarClient.carPrefix + carNumber },
        registeredAt: { N: now.toString() },
        isUploaded: { BOOL: isUploaded },
      }
    }))
    return this.baseClient.batchPutItems(this.tableName, ...putItems)
  }

  rawBatchDelete(items: Record<string, AttributeValue>[]) {
    const deleteRequestInput = items.map(item => ({
      Key: { PK: item.PK, SK: item.SK }
    }))
    return this.baseClient.batchDeleteItems(this.tableName, ...deleteRequestInput)
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

  // 여기서 옵션으로 isUploaded = false인 애들만 가져오는 것을 추가해야한다.
  queryById(id: string) {
    return this.baseClient.queryItems({
      TableName: this.tableName,
      KeyConditionExpression: "PK = :p",
      ExpressionAttributeValues: {
        ":p": { S: DynamoUploadedCarClient.userPrefix + id },
      },
    })
  }

  queryByIdFilteredByIsUploaded(id: string, isUploaded: boolean) {
    return this.baseClient.queryItems({
      TableName: this.tableName,
      KeyConditionExpression: "PK = :p",
      FilterExpression: "isUploaded = :u",
      ExpressionAttributeValues: {
        ":p": { S: DynamoUploadedCarClient.userPrefix + id },
        ":u": { BOOL: isUploaded }
      },
    })
  }
}

