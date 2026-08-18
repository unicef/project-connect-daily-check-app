declare module '@m-lab/ndt7' {
  export interface Ndt7Config {
    userAcceptedDataPolicy?: boolean;
    mlabDataPolicyInapplicable?: boolean;
    downloadworkerfile?: string;
    uploadworkerfile?: string;
    server?: string;
    protocol?: string;
    loadbalancer?: string;
    clientRegistrationToken?: string;
    metadata?: Record<string, string>;
  }

  export interface Ndt7Callbacks {
    error?: (err: any) => void;
    serverDiscovery?: (data: { loadbalancer: URL }) => void;
    serverChosen?: (server: any) => void;
    downloadStart?: (data: any) => void;
    downloadMeasurement?: (data: any) => void;
    downloadComplete?: (data: any) => void;
    uploadStart?: (data: any) => void;
    uploadMeasurement?: (data: any) => void;
    uploadComplete?: (data: any) => void;
  }

  const ndt7: {
    discoverServerURLs: (
      config: Ndt7Config,
      userCallbacks: Ndt7Callbacks
    ) => Promise<any>;
    downloadTest: (
      config: Ndt7Config,
      userCallbacks: Ndt7Callbacks,
      urlPromise: Promise<any>
    ) => Promise<number>;
    uploadTest: (
      config: Ndt7Config,
      userCallbacks: Ndt7Callbacks,
      urlPromise: Promise<any>
    ) => Promise<number>;
    test: (config: Ndt7Config, userCallbacks: Ndt7Callbacks) => Promise<number>;
  };
  export default ndt7;
}
