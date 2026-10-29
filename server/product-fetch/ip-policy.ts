import ipaddr from 'ipaddr.js';
const v4Blocked=['0.0.0.0/8','10.0.0.0/8','100.64.0.0/10','127.0.0.0/8','169.254.0.0/16','172.16.0.0/12',
  '192.0.0.0/24','192.0.2.0/24','192.88.99.0/24','192.168.0.0/16','198.18.0.0/15','198.51.100.0/24',
  '203.0.113.0/24','224.0.0.0/4','240.0.0.0/4','168.63.129.16/32'].map((cidr)=>ipaddr.parseCIDR(cidr));
const v6Blocked=['2001::/23','2001:db8::/32','2002::/16','3ffe::/16','3fff::/20'].map((cidr)=>ipaddr.parseCIDR(cidr));
export function publicAddress(value:string): boolean {
  try {
    let ip=ipaddr.parse(value);
    if(ip.kind()==='ipv6' && (ip as ipaddr.IPv6).isIPv4MappedAddress())ip=(ip as ipaddr.IPv6).toIPv4Address();
    if(ip.kind()==='ipv4')return ip.range()==='unicast' && !v4Blocked.some(([network,bits])=>ip.match(network,bits));
    return ip.range()==='unicast' && ip.match(ipaddr.parse('2000::'),3) && !v6Blocked.some(([network,bits])=>ip.match(network,bits));
  }catch{return false;}
}
export function sameAddress(a:string,b:string):boolean {
  try{return ipaddr.process(a).toNormalizedString()===ipaddr.process(b).toNormalizedString();}catch{return false;}
}
