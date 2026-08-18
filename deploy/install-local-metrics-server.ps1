$ErrorActionPreference = "Stop"

$metricsVersion = "v0.9.0"
$manifestUrl = "https://github.com/kubernetes-sigs/metrics-server/releases/download/$metricsVersion/components.yaml"
$insecureKubeletPatch = '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

kubectl apply -f $manifestUrl
kubectl patch deployment metrics-server -n kube-system --type=json --patch $insecureKubeletPatch
kubectl rollout status deployment/metrics-server -n kube-system --timeout=180s
kubectl top nodes

Write-Host "Metrics Server $metricsVersion is ready. --kubelet-insecure-tls is suitable only for this local self-signed test cluster."
