export class ConfluenceAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'ConfluenceAPIError';
  }
}

export class AuthenticationError extends ConfluenceAPIError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class TokenExpiredError extends ConfluenceAPIError {
  constructor(message: string = 'API token has expired') {
    super(message, 401);
    this.name = 'TokenExpiredError';
  }
}

export class RateLimitError extends ConfluenceAPIError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

export class ConfigurationError extends Error {
  constructor(message: string = 'Configuration error') {
    super(message);
    this.name = 'ConfigurationError';
  }
}