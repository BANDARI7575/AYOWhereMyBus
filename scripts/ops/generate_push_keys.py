"""Generate private local Web Push configuration. Never print private keys."""
import argparse
import re
import base64
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from cryptography.fernet import Fernet
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--directory',type=Path,required=True);p.add_argument('--contact',required=True,help='Real operator email, without mailto:')
a=p.parse_args()
if not re.fullmatch(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',a.contact):p.error('Provide the real operator contact')
a.directory.mkdir(mode=0o700,parents=True,exist_ok=True)
private=a.directory/'vapid-private.pem';config=a.directory/'push.env'
if private.exists() or config.exists():p.error('Target keys/config already exist; choose a new directory')
key=ec.generate_private_key(ec.SECP256R1())
with private.open('xb') as f:private.chmod(0o600);f.write(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
public=base64.urlsafe_b64encode(key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)).decode().rstrip('=')
with config.open('x') as f:
 config.chmod(0o600);f.write(f'VAPID_PRIVATE_KEY={private.resolve()}\nVAPID_PUBLIC_KEY={public}\nVAPID_SUBJECT=mailto:{a.contact}\nPUSH_ENCRYPTION_KEY={Fernet.generate_key().decode()}\n')
print('Private key and configuration written with 0600 permissions. Import into the host secret manager; do not commit or log them.')
