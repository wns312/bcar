
import {
  AttributeValue,
  BatchGetItemCommand,
  BatchGetItemCommandInput,
  BatchWriteItemCommand,
  BatchWriteItemCommandInput,
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
import { chunk } from "../../utils/index"

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

  queryItems(input: QueryCommandInput) {
    return this.client.send(new QueryCommand(input))
  }

  batchGetItem(input: BatchGetItemCommandInput) {
    return this.client.send(new BatchGetItemCommand(input))
  }

  batchGetItems(tableName: string, ...keys: string[]) {
    const keyInputs = keys.map(pk=>({
        PK: { S: pk },
        SK: { S: pk },
      }))
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

  batchPutItems(tableName: string, ...putRequestInputs: PutRequest[]) {
    const input = putRequestInputs.map(input=>({ PutRequest: input }))
    const responses = chunk(input, 25).map(putRequests => {
      return this.batchWriteItem({
        RequestItems: {
          [tableName]: putRequests
        }
      })
    })
    return Promise.all(responses)
  }

  batchDeleteItems(tableName: string, ...deleteRequestInputs: DeleteRequest[]) {
    const input = deleteRequestInputs.map(input=>({ DeleteRequest: input }))
    const responses = chunk(input, 25).map(putRequests => {
      return this.batchWriteItem({
        RequestItems: {
          [tableName]: putRequests
        }
      })
    })
    return Promise.all(responses)
  }
}
