-- CreateIndex
CREATE UNIQUE INDEX "VendorPayment_vendorId_transactionReference_key" ON "VendorPayment"("vendorId", "transactionReference");
