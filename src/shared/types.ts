/** Common type definitions shared across subsystems */

export interface ApiEndpoint {
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  operationId?: string;
  requiresSecretKey: boolean;
  parameters: ApiParameter[];
  requestBody?: string;
  requestBodySchema?: Record<string, unknown>;
  responses: Record<string, ResponseDetail>;
}

export interface ApiParameter {
  name: string;
  in: string;
  required: boolean;
  description: string;
  type: string;
}

export interface ResponseDetail {
  description: string;
  schema?: string;
}
