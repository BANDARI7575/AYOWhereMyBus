"""Create private, short-lived LAN testing certificates. Never installs trust or opens a port."""
import argparse
from datetime import datetime, timedelta, timezone
import ipaddress
from pathlib import Path
import os
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ip', required=True, help='Private LAN IPv4 address of this Mac')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1]/'instance/dev-tls')
    args = parser.parse_args()
    address = ipaddress.ip_address(args.ip)
    if not address.is_private or address.is_unspecified or address.is_multicast:
        parser.error('Use an explicit private LAN or loopback IP; never a public address.')
    os.umask(0o077)
    args.output.mkdir(parents=True, mode=0o700, exist_ok=True)
    names = ['ca.key','ca.crt','ca.cer','server.key','server.crt']
    if any((args.output/name).exists() for name in names):
        parser.error('Certificates already exist. Choose a NEW --output directory; existing keys are never overwritten.')
    now = datetime.now(timezone.utc)
    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'AYO private development CA')])
    ca = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(ca_key.public_key())
          .serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(minutes=5))
          .not_valid_after(now+timedelta(days=30)).add_extension(x509.BasicConstraints(ca=True,path_length=0),True)
          .add_extension(x509.KeyUsage(False,False,False,False,False,True,True,False,False),True)
          .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()),False)
          .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()),False).sign(ca_key,hashes.SHA256()))
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    server = (x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'AYO LAN development')]))
              .issuer_name(name).public_key(key.public_key()).serial_number(x509.random_serial_number())
              .not_valid_before(now-timedelta(minutes=5)).not_valid_after(now+timedelta(days=14))
              .add_extension(x509.BasicConstraints(ca=False,path_length=None),True)
              .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),False)
              .add_extension(x509.KeyUsage(True,False,True,False,False,False,False,False,False),True)
              .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()),False)
              .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()),False)
              .add_extension(x509.SubjectAlternativeName([x509.IPAddress(address),x509.IPAddress(ipaddress.ip_address('127.0.0.1')),x509.DNSName('localhost')]),False)
              .sign(ca_key,hashes.SHA256()))
    for filename,value in [('ca.key',ca_key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())),('server.key',key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())),('ca.crt',ca.public_bytes(serialization.Encoding.PEM)),('ca.cer',ca.public_bytes(serialization.Encoding.DER)),('server.crt',server.public_bytes(serialization.Encoding.PEM))]:
        with (args.output/filename).open('xb') as stream:stream.write(value)
    print('Prepared private certificates in',args.output)
    print('CA SHA-256 fingerprint:',ca.fingerprint(hashes.SHA256()).hex())
    print('No trust installed; no server/tunnel started. Transfer ONLY ca.cer to your iPhone after reviewing docs/IPHONE_TESTING.md.')

if __name__=='__main__':main()
