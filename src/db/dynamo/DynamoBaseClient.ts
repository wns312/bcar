
import {
  AttributeValue,
  BatchGetItemCommand,
  BatchGetItemCommandInput,
  BatchWriteItemCommand,
  BatchWriteItemCommandInput,
  BatchWriteItemCommandOutput,
  DeleteItemCommand,
  DeleteItemCommandInput,
  DeleteRequest,
  DescribeTableCommand,
  DynamoDBClient,
  ExecuteStatementCommand,
  ExecuteStatementCommandInput,
  PutItemCommand,
  PutItemCommandInput,
  PutRequest,
  QueryCommand,
  QueryCommandInput,
  ScanCommand,
  ScanCommandInput,
} from "@aws-sdk/client-dynamodb"
import { ResponseError } from "../../errors"
import { chunk, delay } from "../../utils"

export class DynamoBaseClient {
  client: DynamoDBClient

  constructor(region: string) {
    this.client = new DynamoDBClient({ region })
  }

  describeTable(tableName: string) {
    return this.client.send(new DescribeTableCommand({ TableName: tableName }))
  }

  putItem(input: PutItemCommandInput) {
    return this.client.send(new PutItemCommand(input))
  }

  async scanItems(input: ScanCommandInput) {
    const result = await this.client.send(new ScanCommand(input))
    if (result.$metadata.httpStatusCode !== 200) throw new ResponseError(`${result.$metadata}`)
    return result
  }

  async segmentScan(input: ScanCommandInput) {
    let results: Record<string, AttributeValue>[] = []
    while (true) {
      const result = await this.scanItems(input)
      if (result.$metadata.httpStatusCode !== 200) throw new ResponseError(`${result.$metadata}`)
      results = [...results, ...result.Items!]
      if (!result.LastEvaluatedKey) break
      input.ExclusiveStartKey = result.LastEvaluatedKey
    }
    return results
  }

  async queryItems(input: QueryCommandInput) {
    let results: Record<string, AttributeValue>[] = []
    while (true) {
      const result = await this.client.send(new QueryCommand(input))
      if (result.$metadata.httpStatusCode !== 200) throw new ResponseError(`${result.$metadata}`)
      results = [...results, ...result.Items!]
      input.ExclusiveStartKey = result.LastEvaluatedKey
      if (!result.LastEvaluatedKey) break
    }
    return results
  }

  batchGetItem(input: BatchGetItemCommandInput) {
    return this.client.send(new BatchGetItemCommand(input))
  }

  batchGetItems(tableName: string, ...keys: string[][]) {
    const keyInputs = keys.map(([pk, sk])=>({
        PK: { S: pk },
        SK: { S: sk },
      }))
    // 여기도 이슈가 생기는 경우 순차적으로 가져오도록 변경해야 될 수도 있음
    const responses = chunk(keyInputs, 100).map(keys => {
      return this.batchGetItem({
        RequestItems: {
          [tableName]: {
            Keys: keys
          }
        }
      })
    })
    return Promise.all(responses)
  }

  executeStatement(input: ExecuteStatementCommandInput) {
    return this.client.send(new ExecuteStatementCommand(input))
  }

  batchWriteItem(input: BatchWriteItemCommandInput) {
    return this.client.send(new BatchWriteItemCommand(input))
  }

  deleteItems(input: DeleteItemCommandInput) {
    return this.client.send(new DeleteItemCommand(input))
  }

  async batchPutItems(tableName: string, ...putRequestInputs: PutRequest[]) {
    const input = putRequestInputs.map(input=>({ PutRequest: input }))
    const chunks = chunk(input, 25)
    let responses: BatchWriteItemCommandOutput[] = []
    for (const putRequests of chunks) {
      const response = await this.batchWriteItem({
        RequestItems: {
          [tableName]: putRequests
        }
      })
      if (response.$metadata.httpStatusCode !== 200) console.error(response)
      responses.push(response)
    }
    return responses
  }

  async batchDeleteItems(tableName: string, ...deleteRequestInputs: DeleteRequest[]) {
    const input = deleteRequestInputs.map(input=>({ DeleteRequest: input }))
    const chunks = chunk(input, 25)
    let responses: BatchWriteItemCommandOutput[] = []
    for (const deleteRequests of chunks) {
      let response = await this.batchWriteItem({
        RequestItems: {
          [tableName]: deleteRequests
        }
      })
      if (response.UnprocessedItems !== undefined && Object.keys(response.UnprocessedItems).length !== 0) {
        console.error("UnprocessedItems(retry): ", response.UnprocessedItems)
        await delay(1000)
        response = await this.batchWriteItem({
          RequestItems: {
            [tableName]: deleteRequests
          }
        })
      }
      if (response.$metadata.httpStatusCode !== 200) {
        console.error(response)
      }
      responses.push(response)
    }
    return responses
  }
}
