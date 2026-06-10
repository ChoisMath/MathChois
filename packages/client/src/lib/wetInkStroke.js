/*
 * wet-ink 오버레이용 perfect-freehand 1.2.0 (Excalidraw 번들과 동일 버전, 인라인).
 *
 * Excalidraw 는 펜이 움직일 때마다 전체 씬을 재렌더해 태블릿에서 끊긴다. 진행 중인 획을
 * 가벼운 전용 캔버스에 우리가 직접 렌더하고 pointerup 에만 Excalidraw 로 commit 하기 위해,
 * Excalidraw 가 freedraw 렌더에 쓰는 것과 "동일한 함수·동일한 옵션"으로 외곽선을 만든다.
 * 옵션은 vite.config.js 의 excalidrawPenTweak 치환값과 일치해야 미리보기=commit 이 된다.
 */

/* ── perfect-freehand 1.2.0 (getStroke = ae) ── */
function $(e,t,u,x=h=>h){return e*x(.5-t*(.5-u))}function se(e){return[-e[0],-e[1]]}function l(e,t){return[e[0]+t[0],e[1]+t[1]]}function a(e,t){return[e[0]-t[0],e[1]-t[1]]}function b(e,t){return[e[0]*t,e[1]*t]}function he(e,t){return[e[0]/t,e[1]/t]}function R(e){return[e[1],-e[0]]}function B(e,t){return e[0]*t[0]+e[1]*t[1]}function ue(e,t){return e[0]===t[0]&&e[1]===t[1]}function ge(e){return Math.hypot(e[0],e[1])}function de(e){return e[0]*e[0]+e[1]*e[1]}function A(e,t){return de(a(e,t))}function G(e){return he(e,ge(e))}function ie(e,t){return Math.hypot(e[1]-t[1],e[0]-t[0])}function L(e,t,u){let x=Math.sin(u),h=Math.cos(u),y=e[0]-t[0],n=e[1]-t[1],f=y*h-n*x,d=y*x+n*h;return[f+t[0],d+t[1]]}function K(e,t,u){return l(e,b(a(t,e),u))}function ee(e,t,u){return l(e,b(t,u))}var{min:C,PI:xe}=Math,pe=.275,V=xe+1e-4;function ce(e,t={}){let{size:u=16,smoothing:x=.5,thinning:h=.5,simulatePressure:y=!0,easing:n=r=>r,start:f={},end:d={},last:D=!1}=t,{cap:S=!0,easing:j=r=>r*(2-r)}=f,{cap:q=!0,easing:c=r=>--r*r*r+1}=d;if(e.length===0||u<=0)return[];let p=e[e.length-1].runningLength,g=f.taper===!1?0:f.taper===!0?Math.max(u,p):f.taper,T=d.taper===!1?0:d.taper===!0?Math.max(u,p):d.taper,te=Math.pow(u*x,2),_=[],M=[],H=e.slice(0,10).reduce((r,i)=>{let o=i.pressure;if(y){let s=C(1,i.distance/u),W=C(1,1-s);o=C(1,r+(W-r)*(s*pe))}return(r+o)/2},e[0].pressure),m=$(u,h,e[e.length-1].pressure,n),U,X=e[0].vector,z=e[0].point,F=z,O=z,E=F,J=!1;for(let r=0;r<e.length;r++){let{pressure:i}=e[r],{point:o,vector:s,distance:W,runningLength:I}=e[r];if(r<e.length-1&&p-I<3)continue;if(h){if(y){let v=C(1,W/u),Z=C(1,1-v);i=C(1,H+(Z-H)*(v*pe))}m=$(u,h,i,n)}else m=u/2;U===void 0&&(U=m);let le=I<g?j(I/g):1,fe=p-I<T?c((p-I)/T):1;m=Math.max(.01,m*Math.min(le,fe));let re=(r<e.length-1?e[r+1]:e[r]).vector,Y=r<e.length-1?B(s,re):1,be=B(s,X)<0&&!J,ne=Y!==null&&Y<0;if(be||ne){let v=b(R(X),m);for(let Z=1/13,w=0;w<=1;w+=Z)O=L(a(o,v),o,V*w),_.push(O),E=L(l(o,v),o,V*-w),M.push(E);z=O,F=E,ne&&(J=!0);continue}if(J=!1,r===e.length-1){let v=b(R(s),m);_.push(a(o,v)),M.push(l(o,v));continue}let oe=b(R(K(re,s,Y)),m);O=a(o,oe),(r<=1||A(z,O)>te)&&(_.push(O),z=O),E=l(o,oe),(r<=1||A(F,E)>te)&&(M.push(E),F=E),H=i,X=s}let P=e[0].point.slice(0,2),k=e.length>1?e[e.length-1].point.slice(0,2):l(e[0].point,[1,1]),Q=[],N=[];if(e.length===1){if(!(g||T)||D){let r=ee(P,G(R(a(P,k))),-(U||m)),i=[];for(let o=1/13,s=o;s<=1;s+=o)i.push(L(r,P,V*2*s));return i}}else{if(!(g||T&&e.length===1))if(S)for(let i=1/13,o=i;o<=1;o+=i){let s=L(M[0],P,V*o);Q.push(s)}else{let i=a(_[0],M[0]),o=b(i,.5),s=b(i,.51);Q.push(a(P,o),a(P,s),l(P,s),l(P,o))}let r=R(se(e[e.length-1].vector));if(T||g&&e.length===1)N.push(k);else if(q){let i=ee(k,r,m);for(let o=1/29,s=o;s<1;s+=o)N.push(L(i,k,V*3*s))}else N.push(l(k,b(r,m)),l(k,b(r,m*.99)),a(k,b(r,m*.99)),a(k,b(r,m)))}return _.concat(N,M.reverse(),Q)}function me(e,t={}){var q;let{streamline:u=.5,size:x=16,last:h=!1}=t;if(e.length===0)return[];let y=.15+(1-u)*.85,n=Array.isArray(e[0])?e:e.map(({x:c,y:p,pressure:g=.5})=>[c,p,g]);if(n.length===2){let c=n[1];n=n.slice(0,-1);for(let p=1;p<5;p++)n.push(K(n[0],c,p/4))}n.length===1&&(n=[...n,[...l(n[0],[1,1]),...n[0].slice(2)]]);let f=[{point:[n[0][0],n[0][1]],pressure:n[0][2]>=0?n[0][2]:.25,vector:[1,1],distance:0,runningLength:0}],d=!1,D=0,S=f[0],j=n.length-1;for(let c=1;c<n.length;c++){let p=h&&c===j?n[c].slice(0,2):K(S.point,n[c],y);if(ue(S.point,p))continue;let g=ie(p,S.point);if(D+=g,c<j&&!d){if(D<x)continue;d=!0}S={point:p,pressure:n[c][2]>=0?n[c][2]:.5,vector:G(a(S.point,p)),distance:g,runningLength:D},f.push(S)}return f[0].vector=((q=f[1])==null?void 0:q.vector)||[0,0],f}function ae(e,t={}){return ce(me(e,t),t)}
const getStroke = ae;

/* ── Excalidraw 의 getSvgPathFromStroke (median Q-curve) — 동일 복제 ── */
function med(p, q) { return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; }
function getSvgPathFromStroke(points) {
  if (!points.length) return '';
  const max = points.length - 1;
  return points
    .reduce((acc, point, i, arr) => {
      if (i === max) acc.push(point, med(point, arr[0]), 'L', arr[0], 'Z');
      else acc.push(point, med(point, arr[i + 1]));
      return acc;
    }, ['M', points[0], 'Q'])
    .join(' ');
}

/* vite.config.js 의 excalidrawPenTweak 치환값과 일치해야 미리보기=commit. */
const PF_BASE = {
  thinning: 0.2,
  smoothing: 0.5,
  streamline: 0.62,
  easing: (t) => t,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true },
};

/* Excalidraw getFreeDrawSvgPath 와 동일하게 입력 점을 구성한다. */
function toInputPoints(points, pressures, simulatePressure) {
  if (simulatePressure) return points.map((p) => [p[0], p[1]]);
  return points.map((p, i) => [p[0], p[1], pressures[i] ?? 0.5]);
}

/**
 * 화면 좌표 점들로 freedraw 외곽선 Path2D 생성 (오버레이 미리보기용).
 * @param {number[][]} points  [[x,y], ...] 화면 px
 * @param {number[]} pressures
 * @param {{ size: number, simulatePressure: boolean, last?: boolean }} opts
 */
export function buildStrokePath(points, pressures, { size, simulatePressure, last = false }) {
  if (!points.length) return null;
  const outline = getStroke(toInputPoints(points, pressures, simulatePressure), {
    ...PF_BASE, size, simulatePressure, last,
  });
  if (!outline.length) return null;
  return new Path2D(getSvgPathFromStroke(outline));
}

/**
 * scene 좌표 점들로 Excalidraw freedraw 요소를 만든다(수동 — convertToExcalidrawElements 는 freedraw 미지원).
 * @param {{x:number,y:number}[]} scenePoints  scene 좌표
 * @param {number[]} pressures
 * @param {{ strokeColor: string, strokeWidth: number, simulatePressure: boolean }} opts
 */
export function makeFreedrawElement(scenePoints, pressures, { strokeColor, strokeWidth, simulatePressure }) {
  const ox = scenePoints[0].x;
  const oy = scenePoints[0].y;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const points = scenePoints.map((p) => {
    const rx = p.x - ox, ry = p.y - oy;
    if (rx < minX) minX = rx; if (ry < minY) minY = ry;
    if (rx > maxX) maxX = rx; if (ry > maxY) maxY = ry;
    return [rx, ry];
  });
  const rnd = () => Math.floor(Math.random() * 2 ** 31);
  return {
    type: 'freedraw',
    id: `wi_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    x: ox, y: oy,
    width: maxX - minX,
    height: maxY - minY,
    angle: 0,
    strokeColor,
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: rnd(),
    version: 1,
    versionNonce: rnd(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    points,
    pressures: simulatePressure ? [] : pressures.slice(),
    simulatePressure,
    lastCommittedPoint: points[points.length - 1] ?? null,
  };
}
