![inGen Security](https://www.ingensec.com/images/ingensecuritylong.svg)

# inGen Security WAF On-Premises :+1:

## Requirement
- One machine/VM for the Ultimate
- Different other machine/VM for the Satellite
- Ubuntu 16.04.x based on 64 bits
- NodeJS Version 4.x
- 2Go per Core on Ultimate
- 2Go + 1Go/core on Satellite

## Preparing NodeJS
```bash
curl -sL https://deb.nodesource.com/setup_4.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## Installation
```bash
npm install -g ingensec
```

## Examples

### Installing Ultimate
```bash
npm update -g
ingensec install ultimate
```

### Installing Satellite
```bash
npm update -g
ingensec install satellite
```

### Updating Satellite
```bash
npm update -g
ingensec update satellite
```
### Updating Ultimate
```bash
npm update -g
ingensec update ultimate
```

## Links
- Get more informations about inGen Security at https://www.ingensec.com/
