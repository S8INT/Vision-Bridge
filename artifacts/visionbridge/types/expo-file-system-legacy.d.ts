declare module "expo-file-system/legacy" {
  export type InfoOptions = {
    md5?: boolean;
  };

  export type FileInfo =
    | {
        exists: true;
        uri: string;
        size: number;
        isDirectory: boolean;
        modificationTime: number;
        md5?: string;
      }
    | {
        exists: false;
        uri: string;
        isDirectory: false;
      };

  export function getInfoAsync(
    fileUri: string,
    options?: InfoOptions,
  ): Promise<FileInfo>;
}