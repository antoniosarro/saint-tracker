Comandi per creare le cartelle per il docker

mkdir -p ./data ./logs
sudo chown -R $(id -u):$(id -g) ./data ./logs
chmod -R 755 ./data ./logs