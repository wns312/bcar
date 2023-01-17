import { ScanCommandInput } from "@aws-sdk/client-dynamodb";
import { DynamoBaseClient } from "./DynamoBaseClient"

export class DynamoCarClient {
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

  async scanCar() {
    return this.scan(DynamoCarClient.carPrefix, DynamoCarClient.carPrefix)
  }

  segmentScanCar(segmentSize: number, projectionExpressions?: string[]) {
    return this.segmentScan(DynamoCarClient.carPrefix, DynamoCarClient.carPrefix, segmentSize, projectionExpressions)
  }

  async getCarsByIds(carIds: string[]) {
    const responses = await this.baseClient.batchGetItems(this.tableName, ...carIds)
    return responses.map(response=>{
      if (response.$metadata.httpStatusCode !== 200) {
        console.error(response);
        throw new Error("Response Error")
      }
      return response.Responses![this.tableName]
    }).flat()
  }

}
