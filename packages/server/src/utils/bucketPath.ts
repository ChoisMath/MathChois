import path from 'node:path';

/**
 * path.resolve(volumeRoot, ...segments) 가 volumeRoot/bucket 안이면 버킷 기준 상대 경로('/' 구분, 버킷 자체면 ''),
 * 아니면 null. 버킷 이름 문자열만 비교하면 `x/../ib-guide` 나 경로 안의 `..` 로 우회되므로
 * 실제로 해석된 경로로 판단한다. env 를 읽지 않는 순수 함수라 단위 테스트가 가능하다.
 */
export function bucketRelPath(volumeRoot: string, bucket: string, ...segments: string[]): string | null {
  const bucketRoot = path.join(path.resolve(volumeRoot), bucket);
  const target = path.resolve(volumeRoot, ...segments);
  if (target === bucketRoot) return '';
  if (!target.startsWith(bucketRoot + path.sep)) return null;
  return target.slice(bucketRoot.length + 1).split(path.sep).join('/');
}
