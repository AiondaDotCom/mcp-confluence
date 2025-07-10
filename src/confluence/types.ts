export interface ConfluencePage {
  id: string;
  type: string;
  title: string;
  body?: {
    storage?: {
      value: string;
      representation: string;
    };
    view?: {
      value: string;
      representation: string;
    };
  };
  version?: {
    number: number;
    when: string;
    by: {
      displayName: string;
      email: string;
    };
  };
  space?: {
    key: string;
    name: string;
  };
  _links?: {
    webui: string;
    self: string;
  };
}

export interface ConfluenceSpace {
  key: string;
  name: string;
  type: string;
  description?: {
    plain?: {
      value: string;
    };
  };
  _links?: {
    webui: string;
    self: string;
  };
}

export interface ConfluenceSearchResult {
  results: ConfluencePage[];
  size: number;
  totalSize: number;
  _links?: {
    next?: string;
    prev?: string;
  };
}

export interface ConfluenceAttachment {
  id: string;
  type: string;
  title: string;
  mediaType: string;
  fileSize: number;
  _links?: {
    download: string;
    webui: string;
  };
}

export interface ConfluenceUser {
  accountId: string;
  email: string;
  displayName: string;
  _links?: {
    base: string;
    context: string;
    self: string;
  };
}